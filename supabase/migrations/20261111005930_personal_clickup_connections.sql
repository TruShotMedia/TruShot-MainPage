-- Additive personal routing. The primary Jobs / Outlook integration tables,
-- queues, links, webhook, conflicts and settings are deliberately untouched.
create table public."website-clickup-personal-connections" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  list_id text not null check(list_id ~ '^[0-9]+$' and list_id not in ('1300350000002054','1300350000012117')),
  list_name text not null,
  assigned_user_id bigint not null check(assigned_user_id>0),
  assigned_user_name text not null,
  status_mapping jsonb not null,
  enabled boolean not null default true,
  ready boolean not null default false,
  next_sync_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  failure_count integer not null default 0,
  last_polled_at timestamptz,
  next_poll_at timestamptz not null default now(),
  scan_started_at timestamptz,
  scan_page integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(workspace_id,user_id) references public."website-production-team"(workspace_id,user_id),
  unique(workspace_id,list_id),
  check(status_mapping ?& array['planning','scheduled','production','review','delayed','delivered'])
);
create unique index "personal-clickup-enabled-user" on public."website-clickup-personal-connections"(workspace_id,user_id) where enabled;
create index "personal-clickup-user" on public."website-clickup-personal-connections"(user_id);
create index "personal-clickup-due" on public."website-clickup-personal-connections"(next_sync_at) where enabled;
create table public."website-clickup-personal-links" (
  connection_id uuid not null references public."website-clickup-personal-connections"(id) on delete cascade,
  record_kind text not null check(record_kind in ('job','task')),
  record_id uuid not null,
  clickup_task_id text unique,
  record_title text not null default '',
  parent_task_id text,
  generation integer not null default 1 check(generation>0),
  previous_task_ids text[] not null default '{}',
  create_attempted_at timestamptz,
  last_payload_hash text,
  last_remote_hash text,
  last_shared_state jsonb,
  last_owned_hash text,
  last_checked_at timestamptz,
  origin text not null default 'crm' check(origin in ('crm','clickup')),
  identity_confirmed boolean not null default false,
  overwrite_hash text,
  accept_remote_hash text,
  archived_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  primary key(connection_id,record_kind,record_id)
);
create table public."website-clickup-personal-outbox" (
  connection_id uuid not null references public."website-clickup-personal-connections"(id) on delete cascade,
  record_kind text not null check(record_kind in ('job','task')),
  record_id uuid not null,
  revision bigint not null default 1,
  requested_at timestamptz not null default now(),
  primary key(connection_id,record_kind,record_id)
);
create index "personal-clickup-queue-order" on public."website-clickup-personal-outbox"(connection_id,requested_at);
alter table public."website-clickup-personal-connections" enable row level security;
alter table public."website-clickup-personal-links" enable row level security;
alter table public."website-clickup-personal-outbox" enable row level security;
revoke all on public."website-clickup-personal-connections",public."website-clickup-personal-links",public."website-clickup-personal-outbox" from public,anon,authenticated;
grant select on public."website-clickup-personal-connections" to authenticated;
create policy "personal-clickup-manager-read" on public."website-clickup-personal-connections" for select to authenticated
using((select "website-private"."website-team-manager"(workspace_id)));
grant select,insert,update,delete on public."website-clickup-personal-connections",public."website-clickup-personal-links",public."website-clickup-personal-outbox" to service_role;

create function "website-private"."website-personal-clickup-guard"()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.workspace_id,new.user_id,new.list_id,new.assigned_user_id) is distinct from (old.workspace_id,old.user_id,old.list_id,old.assigned_user_id) then
    raise exception 'Connection identity cannot be changed. Pause it and create a new connection.'; end if;
  if exists(select 1 from public."website-production-team" t where t.workspace_id=new.workspace_id and t.user_id=new.user_id and t.is_primary_videographer)
    or exists(select 1 from public."website-clickup-integrations" i where i.workspace_id=new.workspace_id and i.list_id=new.list_id)
    or exists(select 1 from public."website-clickup-outlook-bridge" o where o.workspace_id=new.workspace_id and o.list_id=new.list_id) then
    raise exception 'The primary Jobs and Outlook connections are reserved.'; end if;
  if new.enabled and (tg_op='INSERT' or not old.enabled) and not exists(select 1 from public."website-production-team" t where t.workspace_id=new.workspace_id and t.user_id=new.user_id and t.is_active) then
    raise exception 'Enable the team member before connecting ClickUp.'; end if;
  return new;
end $$;
revoke all on function "website-private"."website-personal-clickup-guard"() from public,anon,authenticated,service_role;
create trigger "personal-clickup-guard" before insert or update on public."website-clickup-personal-connections"
for each row execute function "website-private"."website-personal-clickup-guard"();

create function "website-private"."website-queue-personal-clickup"(p_workspace uuid,p_kind text,p_record uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public."website-clickup-personal-outbox"(connection_id,record_kind,record_id)
  select c.id,p_kind,p_record from public."website-clickup-personal-connections" c
  where c.workspace_id=p_workspace and c.enabled and exists(select 1 from public."website-production-team" member where member.workspace_id=c.workspace_id and member.user_id=c.user_id and member.is_active and not member.is_primary_videographer) and (
    exists(select 1 from public."website-clickup-personal-links" l where l.connection_id=c.id and l.record_kind=p_kind and l.record_id=p_record)
    or exists(select 1 from public."website-jobs" j join public."website-clients" cl on cl.id=j.client_id and cl.workspace_id=j.workspace_id
      where j.workspace_id=p_workspace and j.archived_at is null and lower(btrim(cl.name))='autopacific group'
      and ((p_kind='job' and j.id=p_record and c.user_id=any(j.assignee_ids))
        or(p_kind='task' and exists(select 1 from public."website-job-tasks" t where t.job_id=j.id and t.workspace_id=j.workspace_id
          and t.id=p_record and t.archived_at is null and c.user_id=any(t.assignee_ids)))))
  ) on conflict(connection_id,record_kind,record_id) do update set revision="website-clickup-personal-outbox".revision+1,requested_at=now();
  update public."website-clickup-personal-connections" c set next_sync_at=least(next_sync_at,now()) where c.workspace_id=p_workspace and c.enabled
    and exists(select 1 from public."website-clickup-personal-outbox" q where q.connection_id=c.id and q.record_kind=p_kind and q.record_id=p_record);
end $$;
revoke all on function "website-private"."website-queue-personal-clickup"(uuid,text,uuid) from public,anon,authenticated,service_role;

create function "website-private"."website-personal-clickup-source-change"()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; ws uuid; parent uuid;
begin
  if tg_op='DELETE' then target:=old.id;ws:=old.workspace_id;else target:=new.id;ws:=new.workspace_id;end if;
  if tg_table_name='website-jobs' then
    perform "website-private"."website-queue-personal-clickup"(ws,'job',target);
    -- A parent change can alter inherited task deadlines or subtask placement.
    for parent in select id from public."website-job-tasks" where job_id=target and workspace_id=ws loop
      perform "website-private"."website-queue-personal-clickup"(ws,'task',parent);
    end loop;
  else
    perform "website-private"."website-queue-personal-clickup"(ws,'task',target);
    if tg_op<>'DELETE' then perform "website-private"."website-queue-personal-clickup"(ws,'job',new.job_id);end if;
    if tg_op<>'INSERT' then perform "website-private"."website-queue-personal-clickup"(ws,'job',old.job_id);end if;
  end if;
  return null;
end $$;
revoke all on function "website-private"."website-personal-clickup-source-change"() from public,anon,authenticated,service_role;
create trigger "personal-clickup-job-change" after insert or update or delete on public."website-jobs"
for each row execute function "website-private"."website-personal-clickup-source-change"();
create trigger "personal-clickup-task-change" after insert or update or delete on public."website-job-tasks"
for each row execute function "website-private"."website-personal-clickup-source-change"();

-- Service-only lease/configuration RPC. Concurrent manager edits and workers
-- serialize on the connection row; no open transaction spans a provider call.
create function public."website-personal-clickup-lease"(p_connection uuid,p_token uuid,p_action text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if p_action='claim' then
    update public."website-clickup-personal-connections" c set lease_token=p_token,lease_until=now()+interval '2 minutes'
    where c.id=p_connection and c.enabled and c.ready and c.next_sync_at<=now() and (c.lease_until is null or c.lease_until<now())
      and exists(select 1 from public."website-production-team" t where t.workspace_id=c.workspace_id and t.user_id=c.user_id and t.is_active and not t.is_primary_videographer);
  elsif p_action='renew' then
    update public."website-clickup-personal-connections" c set lease_until=now()+interval '2 minutes'
    where c.id=p_connection and c.lease_token=p_token and c.lease_until>=now() and c.enabled and c.ready
      and exists(select 1 from public."website-production-team" t where t.workspace_id=c.workspace_id and t.user_id=c.user_id and t.is_active and not t.is_primary_videographer);
  elsif p_action='release' then
    update public."website-clickup-personal-connections" set lease_token=null,lease_until=null where id=p_connection and lease_token=p_token;
  else raise exception 'Unknown lease action.';end if;
  get diagnostics changed=row_count;return changed=1;
end $$;
revoke all on function public."website-personal-clickup-lease"(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public."website-personal-clickup-lease"(uuid,uuid,text) to service_role;

create function public."website-configure-personal-clickup"(p_workspace uuid,p_user uuid,p_list text,p_name text,p_assignee bigint,p_assignee_name text,p_mapping jsonb,p_enabled boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare member public."website-production-team"; conn public."website-clickup-personal-connections"; chosen uuid; rec record;
begin
  select * into member from public."website-production-team" where workspace_id=p_workspace and user_id=p_user for update;
  if member.user_id is null or member.is_primary_videographer then raise exception 'Choose a non-primary team member.';end if;
  if exists(select 1 from public."website-clickup-personal-connections" where workspace_id=p_workspace and user_id=p_user and lease_until>=now()) then
    raise exception 'Sync is finishing. Try again shortly.';end if;
  if not p_enabled then
    update public."website-clickup-personal-connections" set enabled=false,updated_at=now() where workspace_id=p_workspace and user_id=p_user;
    return null;
  end if;
  if not member.is_active then raise exception 'Enable the team member first.';end if;
  select * into conn from public."website-clickup-personal-connections" where workspace_id=p_workspace and list_id=p_list for update;
  if conn.id is not null and (conn.user_id<>p_user or conn.assigned_user_id<>p_assignee) then
    raise exception 'This list already belongs to a different connection. Its mirror history must be retained.';end if;
  update public."website-clickup-personal-connections" set enabled=false,updated_at=now() where workspace_id=p_workspace and user_id=p_user and enabled;
  if conn.id is null then
    insert into public."website-clickup-personal-connections"(workspace_id,user_id,list_id,list_name,assigned_user_id,assigned_user_name,status_mapping)
    values(p_workspace,p_user,p_list,p_name,p_assignee,p_assignee_name,p_mapping) returning id into chosen;
  else
    chosen:=conn.id;
    update public."website-clickup-personal-connections" set enabled=true,ready=false,list_name=p_name,status_mapping=p_mapping,last_error=null,failure_count=0,next_sync_at=now(),next_poll_at=now(),scan_page=0,scan_started_at=null,updated_at=now() where id=chosen;
  end if;
  insert into public."website-clickup-personal-outbox"(connection_id,record_kind,record_id)
  select chosen,'job',j.id from public."website-jobs" j join public."website-clients" cl on cl.id=j.client_id and cl.workspace_id=j.workspace_id
    where j.workspace_id=p_workspace and j.archived_at is null and lower(btrim(cl.name))='autopacific group' and p_user=any(j.assignee_ids)
  union select chosen,'task',t.id from public."website-job-tasks" t join public."website-jobs" j on j.id=t.job_id and j.workspace_id=t.workspace_id
    join public."website-clients" cl on cl.id=j.client_id and cl.workspace_id=j.workspace_id
    where t.workspace_id=p_workspace and t.archived_at is null and j.archived_at is null and lower(btrim(cl.name))='autopacific group' and p_user=any(t.assignee_ids)
  union select chosen,l.record_kind,l.record_id from public."website-clickup-personal-links" l where l.connection_id=chosen
  on conflict(connection_id,record_kind,record_id) do update set revision="website-clickup-personal-outbox".revision+1,requested_at=now();
  return chosen;
end $$;
revoke all on function public."website-configure-personal-clickup"(uuid,uuid,text,text,bigint,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public."website-configure-personal-clickup"(uuid,uuid,text,text,bigint,text,jsonb,boolean) to service_role;

create function public."website-retry-personal-clickup"(p_connection uuid,p_kind text,p_record uuid,p_remote text,p_generation integer,p_overwrite text,p_accept text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare conn public."website-clickup-personal-connections"; changed integer;
begin
  select * into conn from public."website-clickup-personal-connections" where id=p_connection for update;
  if conn.id is null or not conn.enabled or conn.lease_until>=now() then raise exception 'Sync changed or is finishing.';end if;
  update public."website-clickup-personal-links" set last_payload_hash=null,overwrite_hash=p_overwrite,accept_remote_hash=p_accept
    where connection_id=p_connection and record_kind=p_kind and record_id=p_record and generation=p_generation and clickup_task_id is not distinct from p_remote;
  get diagnostics changed=row_count;if changed<>1 then raise exception 'Mirror changed.';end if;
  insert into public."website-clickup-personal-outbox"(connection_id,record_kind,record_id) values(p_connection,p_kind,p_record)
  on conflict(connection_id,record_kind,record_id) do update set revision="website-clickup-personal-outbox".revision+1,requested_at=now();
  update public."website-clickup-personal-connections" set next_sync_at=now(),last_error=null where id=p_connection;
  if p_accept is not null then perform public."website-queue-personal-inbound"(p_connection,p_remote,null);end if;
end $$;
revoke all on function public."website-retry-personal-clickup"(uuid,text,uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public."website-retry-personal-clickup"(uuid,text,uuid,text,integer,text,text) to service_role;

create table public."website-clickup-personal-webhooks" (
  connection_id uuid primary key references public."website-clickup-personal-connections"(id) on delete cascade,
  webhook_id text not null unique,
  ciphertext text not null,iv text not null,tag text not null
);
create table public."website-clickup-personal-inbox" (
  connection_id uuid not null references public."website-clickup-personal-connections"(id) on delete cascade,
  remote_id text not null,
  revision bigint not null default 1,
  available_at timestamptz not null default now(),
  last_error text,
  primary key(connection_id,remote_id)
);
create index "personal-clickup-inbox-ready" on public."website-clickup-personal-inbox"(connection_id,available_at);
create table public."website-clickup-personal-receipts" (
  dedupe_key text primary key,
  connection_id uuid not null references public."website-clickup-personal-connections"(id) on delete cascade,
  received_at timestamptz not null default now()
);
create index "personal-clickup-receipt-connection" on public."website-clickup-personal-receipts"(connection_id);
create index "personal-clickup-receipt-age" on public."website-clickup-personal-receipts"(received_at);
alter table public."website-clickup-personal-webhooks" enable row level security;
alter table public."website-clickup-personal-inbox" enable row level security;
alter table public."website-clickup-personal-receipts" enable row level security;
revoke all on public."website-clickup-personal-webhooks",public."website-clickup-personal-inbox",public."website-clickup-personal-receipts" from public,anon,authenticated;
grant select,insert,update,delete on public."website-clickup-personal-webhooks",public."website-clickup-personal-inbox",public."website-clickup-personal-receipts" to service_role;

create function public."website-queue-personal-inbound"(p_connection uuid,p_remote text,p_dedupe text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if not exists(select 1 from public."website-clickup-personal-connections" c join public."website-production-team" t on t.workspace_id=c.workspace_id and t.user_id=c.user_id
    where c.id=p_connection and c.enabled and c.ready and t.is_active and not t.is_primary_videographer) then return;end if;
  if p_dedupe is not null then
    insert into public."website-clickup-personal-receipts"(dedupe_key,connection_id) values(p_dedupe,p_connection) on conflict do nothing;
    get diagnostics changed=row_count;if changed=0 then return;end if;
  end if;
  insert into public."website-clickup-personal-inbox"(connection_id,remote_id) values(p_connection,p_remote)
    on conflict(connection_id,remote_id) do update set revision="website-clickup-personal-inbox".revision+1,available_at=now();
  update public."website-clickup-personal-connections" set next_sync_at=least(next_sync_at,now()) where id=p_connection;
end $$;
revoke all on function public."website-queue-personal-inbound"(uuid,text,text) from public,anon,authenticated;
grant execute on function public."website-queue-personal-inbound"(uuid,text,text) to service_role;

-- One transaction owns the remote→CRM claim and mutation. A concurrent CRM
-- edit is checked after row locking; identity and assignment cannot be altered
-- by incoming data. Deleting a mirror never invokes this function.
create function public."website-apply-personal-clickup"(p_connection uuid,p_token uuid,p_remote text,p_kind text,p_record uuid,
  p_parent uuid,p_expected timestamptz,p_parent_expected timestamptz,p_state jsonb,p_status_key text,p_remote_hash text,p_owned_hash text,p_description text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare conn public."website-clickup-personal-connections"; link public."website-clickup-personal-links";
  job public."website-jobs"; asset public."website-job-tasks"; client uuid; status uuid; chosen uuid; effective_due date; effective_time time;
begin
  select * into conn from public."website-clickup-personal-connections" where id=p_connection for update;
  if not conn.enabled or not conn.ready or conn.lease_token is distinct from p_token or conn.lease_until<now()
    or not exists(select 1 from public."website-production-team" t where t.workspace_id=conn.workspace_id and t.user_id=conn.user_id and t.is_active and not t.is_primary_videographer)
    then raise exception 'Connection is not active.';end if;
  if p_kind not in ('job','task') or char_length(btrim(p_state->>'title')) not between 1 and 500 then raise exception 'Invalid incoming record.';end if;
  select id into client from public."website-clients" where workspace_id=conn.workspace_id and lower(btrim(name))='autopacific group' and archived_at is null;
  if client is null then raise exception 'Client unavailable.';end if;
  select * into link from public."website-clickup-personal-links" where clickup_task_id=p_remote for update;
  if link.connection_id is not null and link.connection_id<>p_connection then raise exception 'Remote identity is already claimed.';end if;
  if p_record is null and link.record_id is not null then return link.record_id;end if;
  if p_record is not null and (link.record_id is distinct from p_record or link.record_kind<>p_kind) then raise exception 'Mirror identity changed.';end if;
  chosen:=coalesce(p_record,gen_random_uuid());
  if p_kind='job' then
    select id into status from public."website-job-statuses" where workspace_id=conn.workspace_id and key=p_status_key and is_active;
    if status is null or not conn.status_mapping?p_status_key then raise exception 'Unknown job stage.';end if;
    if p_record is null then
      insert into public."website-jobs"(id,workspace_id,client_id,title,status_id,shoot_date,shoot_time,due_date,due_time,description,assignee_ids)
      values(chosen,conn.workspace_id,client,btrim(p_state->>'title'),status,(p_state->>'shoot_date')::date,(p_state->>'shoot_time')::time,
        (p_state->>'due_date')::date,(p_state->>'due_time')::time,left(p_description,20000),array[conn.user_id]);
    else
      select * into job from public."website-jobs" where id=p_record and workspace_id=conn.workspace_id for update;
      if job.id is null or job.client_id<>client or job.archived_at is not null or not conn.user_id=any(job.assignee_ids) or job.updated_at is distinct from p_expected then raise exception 'CRM record changed.';end if;
      if status<>job.status_id and exists(select 1 from public."website-job-tasks" t where t.workspace_id=conn.workspace_id and t.job_id=job.id and t.archived_at is null) then raise exception 'Linked tasks control this job stage.';end if;
      update public."website-jobs" set title=btrim(p_state->>'title'),status_id=status,shoot_date=(p_state->>'shoot_date')::date,
        shoot_time=(p_state->>'shoot_time')::time,due_date=(p_state->>'due_date')::date,due_time=(p_state->>'due_time')::time where id=job.id;
    end if;
  else
    select * into job from public."website-jobs" where id=p_parent and workspace_id=conn.workspace_id for update;
    if job.id is null or job.client_id<>client or job.archived_at is not null or (p_record is not null and job.updated_at is distinct from p_parent_expected) then raise exception 'Parent changed.';end if;
    select id into status from public."website-task-statuses" where workspace_id=conn.workspace_id and key=p_status_key and is_active;
    if status is null then raise exception 'Unknown asset stage.';end if;
    if p_record is null then
      if not exists(select 1 from public."website-clickup-personal-links" l where l.connection_id=p_connection and l.record_kind='job' and l.record_id=job.id and l.archived_at is null) then raise exception 'Unlinked incoming parent.';end if;
      insert into public."website-job-tasks"(id,workspace_id,job_id,title,status_id,due_date,due_time,due_date_is_override,description,assignee_ids)
        values(chosen,conn.workspace_id,job.id,btrim(p_state->>'title'),status,(p_state->>'due_date')::date,(p_state->>'due_time')::time,true,left(p_description,20000),array[conn.user_id]);
    else
      select * into asset from public."website-job-tasks" where id=p_record and workspace_id=conn.workspace_id for update;
      if asset.id is null or asset.job_id<>job.id or asset.archived_at is not null or not conn.user_id=any(asset.assignee_ids) or asset.updated_at is distinct from p_expected then raise exception 'CRM asset changed.';end if;
      effective_due:=case when asset.due_date_is_override then asset.due_date else coalesce(asset.due_date,job.due_date) end;
      effective_time:=coalesce(asset.due_time,case when coalesce(asset.due_date,job.due_date)=job.due_date then job.due_time end);
      update public."website-job-tasks" set title=btrim(p_state->>'title'),status_id=status,
        due_date=case when (p_state->>'due_date')::date is distinct from effective_due then (p_state->>'due_date')::date else due_date end,
        due_time=case when (p_state->>'due_time')::time is distinct from effective_time then (p_state->>'due_time')::time else due_time end,
        due_date_is_override=case when (p_state->>'due_date')::date is distinct from effective_due or (p_state->>'due_time')::time is distinct from effective_time then true else due_date_is_override end
        where id=asset.id;
    end if;
  end if;
  if p_record is null then
    insert into public."website-clickup-personal-links"(connection_id,record_kind,record_id,record_title,clickup_task_id,origin,last_remote_hash,last_shared_state,last_owned_hash)
      values(p_connection,p_kind,chosen,p_state->>'title',p_remote,'clickup',p_remote_hash,p_state,p_owned_hash);
    -- The INSERT trigger ran before its link existed; make the outbound tag
    -- write explicit and durable in the same claim transaction.
    insert into public."website-clickup-personal-outbox"(connection_id,record_kind,record_id) values(p_connection,p_kind,chosen)
      on conflict(connection_id,record_kind,record_id) do update set revision="website-clickup-personal-outbox".revision+1,requested_at=now();
  else
    update public."website-clickup-personal-links" set last_remote_hash=p_remote_hash,last_shared_state=p_state,last_owned_hash=p_owned_hash,
      last_payload_hash=null,last_error=null,accept_remote_hash=null,last_checked_at=now() where connection_id=p_connection and record_kind=p_kind and record_id=chosen;
  end if;
  return chosen;
end $$;
revoke all on function public."website-apply-personal-clickup"(uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function public."website-apply-personal-clickup"(uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,jsonb,text,text,text,text) to service_role;

create function public."website-request-personal-reconcile"(p_connection uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare conn public."website-clickup-personal-connections";
begin
  select * into conn from public."website-clickup-personal-connections" where id=p_connection for update;
  if conn.id is null or not conn.enabled or not conn.ready or conn.lease_until>=now() then raise exception 'Connection unavailable or busy.';end if;
  update public."website-clickup-personal-connections" set next_sync_at=now(),next_poll_at=now() where id=p_connection;
  update public."website-clickup-personal-inbox" set available_at=now() where connection_id=p_connection;
  insert into public."website-clickup-personal-outbox"(connection_id,record_kind,record_id)
  select connection_id,record_kind,record_id from public."website-clickup-personal-links" where connection_id=p_connection
  on conflict(connection_id,record_kind,record_id) do update set revision="website-clickup-personal-outbox".revision+1,requested_at=now();
end $$;
revoke all on function public."website-request-personal-reconcile"(uuid) from public,anon,authenticated;
grant execute on function public."website-request-personal-reconcile"(uuid) to service_role;

create table public."website-clickup-personal-budget" (
  workspace_id uuid primary key references public."website-workspaces"(id) on delete cascade,
  window_started_at timestamptz not null default now(),requests integer not null default 0
);
alter table public."website-clickup-personal-budget" enable row level security;
revoke all on public."website-clickup-personal-budget" from public,anon,authenticated;
grant select,insert,update,delete on public."website-clickup-personal-budget" to service_role;
create function public."website-personal-clickup-request"(p_workspace uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  insert into public."website-clickup-personal-budget"(workspace_id) values(p_workspace) on conflict do nothing;
  update public."website-clickup-personal-budget" set requests=case when window_started_at<now()-interval '60 seconds' then 1 else requests+1 end,
    window_started_at=case when window_started_at<now()-interval '60 seconds' then now() else window_started_at end
    where workspace_id=p_workspace and (window_started_at<now()-interval '60 seconds' or requests<20);
  get diagnostics changed=row_count;return changed=1;
end $$;
revoke all on function public."website-personal-clickup-request"(uuid) from public,anon,authenticated;
grant execute on function public."website-personal-clickup-request"(uuid) to service_role;
create function public."website-prune-personal-clickup-receipts"()
returns void language sql security invoker set search_path='' as $$
  delete from public."website-clickup-personal-receipts" where dedupe_key in
    (select dedupe_key from public."website-clickup-personal-receipts" where received_at<now()-interval '30 days' order by received_at limit 500);
$$;
revoke all on function public."website-prune-personal-clickup-receipts"() from public,anon,authenticated;
grant execute on function public."website-prune-personal-clickup-receipts"() to service_role;
