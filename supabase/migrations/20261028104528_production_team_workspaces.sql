-- Applied remote migration version: 20261028104528.
-- Team access is independent of full TruShot CRM membership. No Auth user is
-- enabled by implication, email domain or user-editable JWT metadata.
create table public."website-production-team" (
  workspace_id uuid not null references public."website-workspaces"(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  username text not null check (username ~ '^[a-z0-9][a-z0-9_.-]{1,39}$'),
  role text not null default 'marketing' check (role in ('manager','videographer','marketing')),
  is_primary_videographer boolean not null default false,
  is_active boolean not null default false,
  avatar_color text not null default '#5d91b0' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  enabled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id), unique(workspace_id,username)
);
create index "website-production-team-user-idx" on public."website-production-team"(user_id);
create unique index "website-production-team-primary-idx" on public."website-production-team"(workspace_id) where is_primary_videographer;
alter table public."website-production-team" enable row level security;
revoke all on public."website-production-team" from anon,authenticated;
grant select on public."website-production-team" to authenticated;
grant all on public."website-production-team" to service_role;

insert into public."website-production-team" (workspace_id,user_id,display_name,username,role,is_active,is_primary_videographer)
select p.workspace_id,p.user_id,'John','john','manager',true,true
from public."website-portal-users" p join auth.users u on u.id=p.user_id
where p.portal_key='autopacific' and p.is_active and lower(u.email)='jherholdt@autopac.com.au';

create or replace function "website-private"."website-autopacific-client-id"(requested_workspace_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select c.id from public."website-clients" c where c.workspace_id=requested_workspace_id
    and lower(c.name)='autopacific group' and c.archived_at is null and (select auth.uid()) is not null
    and (select "website-private"."website-has-portal-access"(requested_workspace_id,'autopacific'))
    and exists(select 1 from public."website-production-team" t where t.workspace_id=requested_workspace_id and t.user_id=(select auth.uid()) and t.is_active)
  limit 1;
$$;

create function "website-private"."website-team-role"(p_workspace uuid)
returns text language sql stable security definer set search_path='' as $$
  select t.role from public."website-production-team" t
  where t.workspace_id=p_workspace and t.user_id=(select auth.uid()) and t.is_active
    and (select "website-private"."website-has-portal-access"(p_workspace,'autopacific'));
$$;
create function "website-private"."website-team-manager"(p_workspace uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select (select auth.uid()) is not null and (
    (select "website-private"."website-has-workspace-access"(p_workspace))
    or (select "website-private"."website-team-role"(p_workspace))='manager');
$$;
create policy "team-directory-read" on public."website-production-team" for select to authenticated
using ((select "website-private"."website-team-manager"(workspace_id))
  or (is_active and (select "website-private"."website-team-role"(workspace_id)) is not null));

-- Only the team manager can see the limited Auth directory used by the picker.
create function "website-private"."website-team-directory"(p_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce("website-private"."website-team-manager"(p_workspace),false) then
    raise exception 'Only your team manager can manage membership.' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'email',u.email,
    'display_name',coalesce(t.display_name,split_part(u.email,'@',1)),
    'username',t.username,'role',coalesce(t.role,'marketing'),'is_active',coalesce(t.is_active,false),
    'avatar_color',coalesce(t.avatar_color,'#5d91b0')) order by lower(u.email)),'[]')
    from auth.users u left join public."website-production-team" t on t.user_id=u.id and t.workspace_id=p_workspace
    where u.deleted_at is null and u.email is not null);
end $$;
create function public."website-team-directory"(p_workspace uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select "website-private"."website-team-directory"(p_workspace);
$$;

create function "website-private"."website-save-team-member"(p_workspace uuid,p_user uuid,p_name text,p_username text,p_role text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare account_email text;
begin
  if not coalesce("website-private"."website-team-manager"(p_workspace),false) then
    raise exception 'Only your team manager can manage membership.' using errcode='42501';
  end if;
  select lower(email) into account_email from auth.users where id=p_user and deleted_at is null;
  if account_email is null then raise exception 'Choose an existing account.'; end if;
  if p_role not in ('manager','videographer','marketing') or p_active is null then raise exception 'Choose a valid team role.'; end if;
  if (p_user=auth.uid() or account_email='jherholdt@autopac.com.au') and (not p_active or p_role<>'manager') then
    raise exception 'Keep your managing account enabled as a manager.';
  end if;
  insert into public."website-production-team"(workspace_id,user_id,display_name,username,role,is_active)
  values(p_workspace,p_user,btrim(p_name),lower(btrim(p_username)),p_role,p_active)
  on conflict(workspace_id,user_id) do update set display_name=excluded.display_name,username=excluded.username,
    role=excluded.role,is_active=excluded.is_active,updated_at=now(),
    enabled_at=case when not "website-production-team".is_active and excluded.is_active then now() else "website-production-team".enabled_at end;
  insert into public."website-portal-users"(workspace_id,user_id,portal_key,display_name,is_active)
  values(p_workspace,p_user,'autopacific',btrim(p_name),p_active)
  on conflict(workspace_id,user_id,portal_key) do update set display_name=excluded.display_name,is_active=excluded.is_active;
end $$;
create function public."website-save-team-member"(p_workspace uuid,p_user uuid,p_name text,p_username text,p_role text default 'marketing',p_active boolean default false)
returns void language sql security invoker set search_path='' as $$
  select "website-private"."website-save-team-member"(p_workspace,p_user,p_name,p_username,p_role,p_active);
$$;

alter table public."website-jobs" add column assignee_ids uuid[] not null default '{}',
  add column priority text not null default 'normal' check(priority in ('low','normal','high','urgent'));
alter table public."website-job-tasks" add column assignee_ids uuid[] not null default '{}';
alter table public."website-campaigns" add column assignee_ids uuid[] not null default '{}';
alter table public."website-calendar-events" add column assignee_ids uuid[] not null default '{}';
alter table public."website-flight-events" add column assignee_ids uuid[] not null default '{}';
alter table public."website-flight-plans" add column assignee_ids uuid[] not null default '{}';

-- Deliberately bounded to this client's records. Personal/unrelated work is untouched.
do $$ declare person uuid; client record; begin
  select id into person from auth.users where lower(email)='jherholdt@autopac.com.au' and deleted_at is null;
  if person is null then raise exception 'The existing AutoPacific account is required.'; end if;
  for client in select id,workspace_id from public."website-clients" where lower(name)='autopacific group' and archived_at is null loop
    update public."website-jobs" set assignee_ids=array[person] where workspace_id=client.workspace_id and client_id=client.id;
    update public."website-job-tasks" t set assignee_ids=array[person] where t.workspace_id=client.workspace_id
      and exists(select 1 from public."website-jobs" j where j.id=t.job_id and j.client_id=client.id and j.workspace_id=t.workspace_id);
    update public."website-campaigns" set assignee_ids=array[person] where workspace_id=client.workspace_id and client_id=client.id;
    update public."website-calendar-events" set assignee_ids=array[person] where workspace_id=client.workspace_id and client_id=client.id;
    update public."website-flight-events" set assignee_ids=array[person] where workspace_id=client.workspace_id and client_id=client.id;
    update public."website-flight-plans" set assignee_ids=array[person] where workspace_id=client.workspace_id and client_id=client.id;
  end loop;
end $$;

create function "website-private"."website-team-assignments"()
returns trigger language plpgsql security definer set search_path='' as $$
declare client uuid; is_apg boolean; person uuid; inherited uuid[];
begin
  if tg_table_name='website-job-tasks' then
    select j.client_id,j.assignee_ids into client,inherited from public."website-jobs" j where j.id=new.job_id and j.workspace_id=new.workspace_id;
  else client:=new.client_id; end if;
  select exists(select 1 from public."website-clients" c where c.id=client and c.workspace_id=new.workspace_id and lower(c.name)='autopacific group') into is_apg;
  if not is_apg then return new; end if;
  if tg_op='INSERT' and cardinality(new.assignee_ids)=0 then
    if tg_table_name='website-job-tasks' then
      if new.source_deliverable_id is not null and cardinality(inherited)>0 then new.assignee_ids:=inherited; end if;
    end if;
    if cardinality(new.assignee_ids)=0 then
      select t.user_id into person from public."website-production-team" t
        where t.workspace_id=new.workspace_id and t.user_id=auth.uid() and t.is_active;
      if person is null then select u.id into person from auth.users u where lower(u.email)='jherholdt@autopac.com.au' and u.deleted_at is null; end if;
      new.assignee_ids:=array[person];
    end if;
  end if;
  if tg_op='INSERT' or new.assignee_ids is distinct from old.assignee_ids then
    if cardinality(new.assignee_ids) not between 1 and 100 or array_position(new.assignee_ids,null) is not null
      or exists(select 1 from unnest(new.assignee_ids) id where not exists(select 1 from public."website-production-team" t
        where t.workspace_id=new.workspace_id and t.user_id=id and t.is_active)) then
      raise exception 'Assign at least one enabled team member.';
    end if;
    new.assignee_ids:=(select array_agg(distinct id order by id) from unnest(new.assignee_ids) id);
  end if;
  return new;
end $$;
do $$ declare tab text; begin
  foreach tab in array array['website-jobs','website-job-tasks','website-campaigns','website-calendar-events','website-flight-events','website-flight-plans'] loop
    execute format('create trigger "website-team-assignments" before insert or update on public.%I for each row execute function "website-private"."website-team-assignments"()',tab);
    execute format('create index %I on public.%I using gin(assignee_ids)',tab||'-assignees-idx',tab);
  end loop;
end $$;

-- Marketing can work on its own tasks; shared videographer tasks stay review-only.
create function "website-private"."website-can-write-production-task"(p_workspace uuid,p_task uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public."website-job-tasks" t
    where t.id=p_task and t.workspace_id=p_workspace
    and (select "website-private"."website-can-access-production-job"(p_workspace,t.job_id))
    and ((select "website-private"."website-has-workspace-access"(p_workspace))
      or (select "website-private"."website-team-role"(p_workspace)) in ('manager','videographer')
      or (select auth.uid())=any(t.assignee_ids)));
$$;
drop policy "autopacific-tasks" on public."website-job-tasks";
create policy "autopacific-task-read" on public."website-job-tasks" for select to authenticated
using ((select "website-private"."website-can-access-production-job"(workspace_id,job_id)));
create policy "autopacific-task-create" on public."website-job-tasks" for insert to authenticated
with check ((select "website-private"."website-can-access-production-job"(workspace_id,job_id)) and (
  (select "website-private"."website-team-role"(workspace_id)) in ('manager','videographer') or (select auth.uid())=any(assignee_ids)));
create policy "autopacific-task-update" on public."website-job-tasks" for update to authenticated
using ((select "website-private"."website-can-write-production-task"(workspace_id,id)))
with check ((select "website-private"."website-can-access-production-job"(workspace_id,job_id)) and (
  (select "website-private"."website-team-role"(workspace_id)) in ('manager','videographer') or (select auth.uid())=any(assignee_ids)));
create policy "autopacific-task-delete" on public."website-job-tasks" for delete to authenticated
using ((select "website-private"."website-can-write-production-task"(workspace_id,id)));

-- Trip plans and their legs use the same ownership rule. Seeing John's itinerary
-- in the shared calendar never grants permission to change it.
do $$ declare tab text; pol record; begin
  foreach tab in array array['website-flight-events','website-flight-plans'] loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=tab and policyname like 'autopacific-%' loop
      execute format('drop policy %I on public.%I',pol.policyname,tab);
    end loop;
    execute format('create policy "autopacific-flight-read" on public.%I for select to authenticated using (client_id=(select "website-private"."website-autopacific-client-id"(workspace_id)))',tab);
    execute format('create policy "autopacific-flight-write" on public.%I for all to authenticated using (client_id=(select "website-private"."website-autopacific-client-id"(workspace_id)) and ((select "website-private"."website-team-role"(workspace_id)) in (''manager'',''videographer'') or (select auth.uid())=any(assignee_ids))) with check (client_id=(select "website-private"."website-autopacific-client-id"(workspace_id)) and ((select "website-private"."website-team-role"(workspace_id)) in (''manager'',''videographer'') or (select auth.uid())=any(assignee_ids)))',tab);
  end loop;
end $$;

-- A tightly-scoped approval operation, not a general task UPDATE bypass.
create function "website-private"."website-team-approve-task"(p_task uuid)
returns void language plpgsql security definer set search_path='' as $$
declare task record; done uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to approve work.' using errcode='42501'; end if;
  select t.*,s.key as stage into task from public."website-job-tasks" t join public."website-task-statuses" s on s.id=t.status_id
    where t.id=p_task and t.archived_at is null for update of t;
  if not found or not coalesce("website-private"."website-can-access-production-task"(task.workspace_id,task.id),false) then
    raise exception 'This task is unavailable.' using errcode='42501';
  end if;
  if task.stage='posted_done' then return; end if;
  if task.stage not in ('ready_for_revision','final_draft_notes','ready_to_post') then raise exception 'This task is no longer awaiting review.'; end if;
  select id into done from public."website-task-statuses" where workspace_id=task.workspace_id and key='posted_done' and is_active;
  if done is null then raise exception 'Completion status is unavailable.'; end if;
  update public."website-job-tasks" set status_id=done,completed_at=now(),approved_at=now(),approved_by=auth.uid(),updated_by=auth.uid() where id=p_task;
end $$;
create or replace function public."website-approve-production-task"(p_task_id uuid)
returns void language sql security invoker set search_path='' as $$ select "website-private"."website-team-approve-task"(p_task_id); $$;

-- Notes remain intact. Author and mention IDs are distinct from the text body.
alter table public."website-work-record-notes" add column mention_user_ids uuid[] not null default '{}';
create table public."website-note-reads" (
  note_id uuid not null references public."website-work-record-notes"(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  seen_revision timestamptz not null,
  primary key(note_id,user_id)
);
create index "website-note-reads-user-idx" on public."website-note-reads"(user_id);
alter table public."website-note-reads" enable row level security;
revoke all on public."website-note-reads" from anon,authenticated;
grant select,insert,update on public."website-note-reads" to authenticated;
grant all on public."website-note-reads" to service_role;
create policy "own-note-reads" on public."website-note-reads" for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and exists(
  select 1 from public."website-work-record-notes" n where n.id=note_id and seen_revision<=n.updated_at));

drop policy "autopacific-notes" on public."website-work-record-notes";
create policy "autopacific-notes-read" on public."website-work-record-notes" for select to authenticated
using ((record_kind='job' and (select "website-private"."website-can-access-production-job"(workspace_id,job_id)))
  or (record_kind='task' and (select "website-private"."website-can-access-production-task"(workspace_id,task_id))));
create policy "autopacific-notes-add" on public."website-work-record-notes" for insert to authenticated
with check (created_by=(select auth.uid()) and updated_by=(select auth.uid()) and (
  (record_kind='job' and (select "website-private"."website-can-access-production-job"(workspace_id,job_id)))
  or (record_kind='task' and (select "website-private"."website-can-access-production-task"(workspace_id,task_id)))));
create policy "autopacific-notes-edit" on public."website-work-record-notes" for update to authenticated
using ((created_by=(select auth.uid()) or (select "website-private"."website-team-manager"(workspace_id))) and (
  (record_kind='job' and (select "website-private"."website-can-access-production-job"(workspace_id,job_id)))
  or (record_kind='task' and (select "website-private"."website-can-access-production-task"(workspace_id,task_id)))))
with check (updated_by=(select auth.uid()) and ((created_by=(select auth.uid())) or (select "website-private"."website-team-manager"(workspace_id))));

create function "website-private"."website-validate-note-mentions"()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if cardinality(new.mention_user_ids)>50 or exists(select 1 from unnest(new.mention_user_ids) id
    where not exists(select 1 from public."website-production-team" t where t.workspace_id=new.workspace_id and t.user_id=id and t.is_active)) then
    raise exception 'Mention enabled members of this team only.';
  end if;
  if tg_op='UPDATE' and (new.created_by is distinct from old.created_by or new.job_id is distinct from old.job_id
    or new.task_id is distinct from old.task_id or new.record_kind is distinct from old.record_kind or new.workspace_id<>old.workspace_id) then
    raise exception 'A comment cannot be reassigned to a different author or record.';
  end if;
  return new;
end $$;
create trigger "website-validate-note-mentions" before insert or update on public."website-work-record-notes"
for each row execute function "website-private"."website-validate-note-mentions"();
create index "website-work-record-notes-recent-idx" on public."website-work-record-notes"(workspace_id,updated_at desc);

-- One caller-scoped query for the inbox, instead of a chain of per-record reads.
create function public."website-team-comment-feed"(p_workspace uuid)
returns table(id uuid,body text,created_by uuid,created_at timestamptz,updated_at timestamptz,
  mention_user_ids uuid[],record_kind text,job_id uuid,task_id uuid,record_title text,unread boolean)
language sql stable security invoker set search_path='' as $$
  select n.id,n.body,n.created_by,n.created_at,n.updated_at,n.mention_user_ids,n.record_kind,n.job_id,n.task_id,
    case when n.record_kind='task' then t.title else j.title end,
    n.created_by is distinct from (select auth.uid()) and n.updated_at>=coalesce(me.enabled_at,'-infinity'::timestamptz)
      and (r.seen_revision is null or r.seen_revision<n.updated_at)
  from public."website-work-record-notes" n
  left join public."website-job-tasks" t on t.id=n.task_id and t.workspace_id=n.workspace_id and t.archived_at is null
  join public."website-jobs" j on j.id=coalesce(n.job_id,t.job_id) and j.workspace_id=n.workspace_id and j.archived_at is null
  join public."website-clients" c on c.id=j.client_id and c.workspace_id=j.workspace_id and lower(c.name)='autopacific group'
  left join public."website-note-reads" r on r.note_id=n.id and r.user_id=(select auth.uid())
  left join public."website-production-team" me on me.workspace_id=n.workspace_id and me.user_id=(select auth.uid()) and me.is_active
  where n.workspace_id=p_workspace and (select auth.uid()) is not null
  order by n.updated_at desc,n.id limit 200;
$$;
revoke all on function public."website-team-comment-feed"(uuid) from public,anon;
grant execute on function public."website-team-comment-feed"(uuid) to authenticated;

-- Preserve assignments through reschedules; checks on privileged existing RPCs
-- must use write permission, not their deliberately broader read permission.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public."website-delay-job"(uuid,date,text)'::regprocedure);
  if position('campaign_week_id, created_by' in definition)=0 then raise exception 'Unexpected job delay function'; end if;
  definition:=replace(definition,'campaign_week_id, created_by','campaign_week_id, assignee_ids, priority, created_by');
  definition:=replace(definition,'v_source.campaign_week_id, auth.uid()','v_source.campaign_week_id, v_source.assignee_ids, v_source.priority, auth.uid()');
  execute definition;
  definition:=pg_get_functiondef('public."website-delay-task"(uuid,date,text)'::regprocedure);
  definition:=replace(definition,'"website-can-access-production-task"(v_source.workspace_id, v_source.id)','"website-can-write-production-task"(v_source.workspace_id, v_source.id)');
  if position('due_date_is_override, created_by' in definition)=0 then raise exception 'Unexpected task delay function'; end if;
  definition:=replace(definition,'due_date_is_override, created_by','due_date_is_override, assignee_ids, created_by');
  definition:=replace(definition,'v_source.external_url, true, auth.uid()','v_source.external_url, true, v_source.assignee_ids, auth.uid()');
  execute definition;
end $$;

-- Explicit privileges for every helper; none is an anonymous endpoint.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public."website-save-campaign-plan"(uuid,uuid,jsonb)'::regprocedure);
  if position('is_weekly_plan,created_by,updated_by)' in definition)=0 then raise exception 'Unexpected campaign function'; end if;
  definition:=replace(definition,'is_weekly_plan,created_by,updated_by)', 'is_weekly_plan,assignee_ids,created_by,updated_by)');
  definition:=replace(definition,'*7-1),true,auth.uid(),auth.uid())', '*7-1),true,array(select value::uuid from jsonb_array_elements_text(coalesce(p_plan->''assignee_ids'',''[]''))),auth.uid(),auth.uid())');
  definition:=replace(definition,'start_date=excluded.start_date,due_date=excluded.due_date,updated_by=auth.uid()',
    'start_date=excluded.start_date,due_date=excluded.due_date,assignee_ids=case when p_plan ? ''assignee_ids'' then excluded.assignee_ids else "website-campaigns".assignee_ids end,updated_by=auth.uid()');
  definition:=replace(definition,'deliverables=job->''deliverables'',campaign_week_id=week_id,updated_by=auth.uid()',
    'deliverables=job->''deliverables'',campaign_week_id=week_id,assignee_ids=case when job ? ''assignee_ids'' then array(select value::uuid from jsonb_array_elements_text(job->''assignee_ids'')) else j.assignee_ids end,updated_by=auth.uid()');
  definition:=replace(definition,'deliverables,campaign_week_id,created_by,updated_by)', 'deliverables,campaign_week_id,assignee_ids,created_by,updated_by)');
  definition:=replace(definition,'job->''deliverables'',week_id,auth.uid(),auth.uid())',
    'job->''deliverables'',week_id,array(select value::uuid from jsonb_array_elements_text(coalesce(job->''assignee_ids'',p_plan->''assignee_ids'',''[]''))),auth.uid(),auth.uid())');
  execute definition;
end $$;

do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='website-private' and p.proname in ('website-team-role','website-team-manager','website-team-directory','website-save-team-member',
      'website-can-write-production-task','website-team-approve-task') loop
    execute format('revoke all on function %s from public,anon',fn.signature);
    execute format('grant execute on function %s to authenticated',fn.signature);
  end loop;
end $$;
revoke all on function "website-private"."website-team-assignments"(), "website-private"."website-validate-note-mentions"() from public,anon,authenticated,service_role;
revoke all on function public."website-team-directory"(uuid),public."website-save-team-member"(uuid,uuid,text,text,text,boolean) from public,anon;
grant execute on function public."website-team-directory"(uuid),public."website-save-team-member"(uuid,uuid,text,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
