-- Child mirroring is opt-in until the verified production worker is live.
alter table public."website-clickup-integrations"
  add column sync_subtasks boolean not null default false,
  add column subtask_lease_token uuid,
  add column subtask_lease_until timestamptz;

create table public."website-clickup-subtask-links" (
  workspace_id uuid not null references public."website-workspaces"(id) on delete cascade,
  task_id uuid not null,
  job_id uuid not null,
  parent_clickup_task_id text not null,
  clickup_task_id text,
  last_payload_hash text,
  create_attempted_at timestamptz,
  archived_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, task_id),
  unique (workspace_id, clickup_task_id)
);
-- Deliberately retain source IDs after hard deletion: the worker needs the
-- mapping to archive its remote copy. No client can read or mutate this table.
comment on table public."website-clickup-subtask-links" is
  'Server-only one-way asset mappings; source IDs are retained as deletion tombstones.';
create index "website-clickup-subtask-links-active-job-idx"
  on public."website-clickup-subtask-links"(workspace_id, job_id) where archived_at is null;
alter table public."website-clickup-subtask-links" enable row level security;
revoke all on public."website-clickup-subtask-links" from public, anon, authenticated;
grant select, insert, update on public."website-clickup-subtask-links" to service_role;
create policy "website-clickup-subtask-links-service" on public."website-clickup-subtask-links"
  for all to service_role using (true) with check (true);

-- A short service-only integration lease serialises reparenting and recovery.
-- It never holds a Postgres transaction open during a ClickUp HTTP request.
create function public."website-clickup-subtask-lease"(p_workspace_id uuid, p_token uuid, p_action text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_token is null then return false; end if;
  if p_action = 'claim' then
    update public."website-clickup-integrations"
      set subtask_lease_token = p_token, subtask_lease_until = clock_timestamp() + interval '5 minutes'
      where workspace_id = p_workspace_id and enabled and sync_subtasks
        and (subtask_lease_until is null or subtask_lease_until < clock_timestamp());
  elsif p_action = 'renew' then
    update public."website-clickup-integrations"
      set subtask_lease_until = clock_timestamp() + interval '5 minutes'
      where workspace_id = p_workspace_id and enabled and sync_subtasks
        and subtask_lease_token = p_token and subtask_lease_until > clock_timestamp();
  elsif p_action = 'release' then
    update public."website-clickup-integrations" set subtask_lease_token = null, subtask_lease_until = null
      where workspace_id = p_workspace_id and subtask_lease_token = p_token;
  else raise exception 'Unknown asset sync lease action';
  end if;
  return found;
end $$;
revoke all on function public."website-clickup-subtask-lease"(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public."website-clickup-subtask-lease"(uuid,uuid,text) to service_role;

-- Status/reparent/archive changes already use the existing progress trigger.
-- Queue detail-only changes once, and only while child syncing is enabled.
create function "website-private"."website-queue-clickup-asset-details"()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and current_setting('role',true) in ('anon','authenticated') then return null; end if;
  if row(old.workspace_id,old.job_id,old.status_id,old.archived_at,old.source_deliverable_id)
    is distinct from row(new.workspace_id,new.job_id,new.status_id,new.archived_at,new.source_deliverable_id) then return null; end if;
  if new.archived_at is not null or row(old.title,old.description,old.asset_type,old.hours,old.due_date,old.due_time,old.due_date_is_override,old.priority)
    is not distinct from row(new.title,new.description,new.asset_type,new.hours,new.due_date,new.due_time,new.due_date_is_override,new.priority) then return null; end if;
  insert into public."website-clickup-sync-outbox"(workspace_id,job_id,operation)
  select job.workspace_id,job.id,'upsert' from public."website-jobs" job
  join public."website-clickup-integrations" integration on integration.workspace_id=job.workspace_id
    and integration.target_client_id=job.client_id and integration.enabled and integration.sync_subtasks
  where job.workspace_id=new.workspace_id and job.id=new.job_id and job.archived_at is null
    and exists(select 1 from public."website-production-team" member where member.workspace_id=job.workspace_id
      and member.is_active and member.is_primary_videographer and member.user_id=any(job.assignee_ids))
  on conflict(workspace_id,job_id) where status in ('pending','retry') do update
    set operation='upsert',status='pending',attempts=0,available_at=now(),processing_started_at=null,completed_at=null,last_error=null;
  return null;
end $$;
revoke all on function "website-private"."website-queue-clickup-asset-details"() from public,anon,authenticated,service_role;
create trigger "website-job-tasks-clickup-details" after update of title,description,asset_type,hours,due_date,due_time,due_date_is_override,priority
  on public."website-job-tasks" for each row execute function "website-private"."website-queue-clickup-asset-details"();

-- The parent write has already passed job RLS. This private trigger deliberately
-- creates the corresponding assets for Marketing too, without granting them
-- direct write access to the videographer's existing tasks.
create function "website-private"."website-auto-job-deliverable-tasks"()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  job public."website-jobs"%rowtype;
  item jsonb; old_name text; task_status uuid; next_position numeric; closed boolean;
begin
  if auth.uid() is null and current_setting('role',true) in ('anon','authenticated') then raise exception 'Sign in before saving deliverables.'; end if;
  if tg_op='UPDATE' and row(old.deliverables,old.due_date,old.client_id) is not distinct from row(new.deliverables,new.due_date,new.client_id) then return null; end if;
  -- Read the final row: a campaign/duplication transaction may write it more
  -- than once. Deferral also lets any explicit task copies finish first.
  select * into job from public."website-jobs" where id=new.id and workspace_id=new.workspace_id and archived_at is null for update;
  if not found or not exists(select 1 from public."website-clients" c where c.id=job.client_id and c.workspace_id=job.workspace_id
    and lower(btrim(c.name))='autopacific group') then return null; end if;
  select is_closed into closed from public."website-job-statuses" where id=job.status_id and workspace_id=job.workspace_id;
  select id into task_status from public."website-task-statuses" where workspace_id=job.workspace_id and key='not_started' and is_active and is_open;
  if task_status is null then raise exception 'Not Started status is unavailable.'; end if;
  select coalesce(max(position),0)+1000 into next_position from public."website-job-tasks"
    where workspace_id=job.workspace_id and status_id=task_status and archived_at is null;
  for item in select value from jsonb_array_elements(job.deliverables) loop
    if tg_op='UPDATE' then
      select value->>'name' into old_name from jsonb_array_elements(old.deliverables) where value->>'id'=item->>'id';
      if old_name is not null and old_name is distinct from item->>'name' then
        update public."website-job-tasks" task set title=left(item->>'name',220),updated_by=job.updated_by
          where task.workspace_id=job.workspace_id and task.job_id=job.id and task.source_deliverable_id=(item->>'id')::uuid
            and task.archived_at is null and task.title is distinct from left(item->>'name',220);
      end if;
      -- The original invoker date trigger cannot update the videographer's
      -- tasks on behalf of Marketing. Apply the same bounded, parent-owned
      -- deadline rule here, without touching explicitly rescheduled history.
      update public."website-job-tasks" task
        set due_date=coalesce((item->>'date')::date,job.due_date),due_date_is_override=item->>'date' is not null,updated_by=job.updated_by
        where task.workspace_id=job.workspace_id and task.job_id=job.id and task.source_deliverable_id=(item->>'id')::uuid
          and task.archived_at is null
          and exists(select 1 from public."website-task-statuses" s where s.id=task.status_id and s.is_open)
          and not exists(select 1 from public."website-task-delay-history" h where h.successor_task_id=task.id)
          and (task.due_date is distinct from coalesce((item->>'date')::date,job.due_date)
            or task.due_date_is_override is distinct from (item->>'date' is not null));
    end if;
    if not coalesce(closed,false) then
      insert into public."website-job-tasks"(workspace_id,job_id,status_id,title,description,asset_type,priority,due_date,due_date_is_override,
        source_deliverable_id,position,created_by,updated_by,assignee_ids)
      values(job.workspace_id,job.id,task_status,left(item->>'name',220),case when char_length(item->>'name')>220 then item->>'name' end,
        'Asset',job.priority,coalesce((item->>'date')::date,job.due_date),item->>'date' is not null,(item->>'id')::uuid,
        next_position,coalesce(job.created_by,auth.uid()),coalesce(job.updated_by,auth.uid()),job.assignee_ids)
      on conflict(job_id,source_deliverable_id) where source_deliverable_id is not null do nothing;
      next_position:=next_position+1000;
    end if;
  end loop;
  return null;
end $$;
revoke all on function "website-private"."website-auto-job-deliverable-tasks"() from public,anon,authenticated,service_role;
create constraint trigger "website-jobs-auto-deliverable-tasks"
  after insert or update on public."website-jobs" deferrable initially deferred
  for each row execute function "website-private"."website-auto-job-deliverable-tasks"();
