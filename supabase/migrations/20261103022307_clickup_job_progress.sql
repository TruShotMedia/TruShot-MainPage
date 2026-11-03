-- Task changes must refresh their parent's lightweight ClickUp progress title.
-- Reuse the existing coalescing outbox: no polling and no parent-job writes.
create or replace function "website-private"."website-queue-clickup-task-progress"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_workspace uuid;
  old_job uuid;
  new_workspace uuid;
  new_job uuid;
begin
  -- API writes are still authorized by the task's RLS before this trigger runs.
  -- Trusted imports/maintenance may run as postgres/service_role without a JWT.
  if auth.uid() is null and current_setting('role', true) in ('anon', 'authenticated') then
    return null;
  end if;
  if tg_op = 'UPDATE' and row(old.workspace_id, old.job_id, old.status_id, old.archived_at, old.source_deliverable_id)
    is not distinct from row(new.workspace_id, new.job_id, new.status_id, new.archived_at, new.source_deliverable_id) then
    return null;
  end if;
  if tg_op <> 'INSERT' then
    if old.archived_at is null then old_workspace := old.workspace_id; old_job := old.job_id; end if;
  end if;
  if tg_op <> 'DELETE' then
    if new.archived_at is null then new_workspace := new.workspace_id; new_job := new.job_id; end if;
  end if;

  insert into public."website-clickup-sync-outbox" (workspace_id, job_id, operation)
  select distinct job.workspace_id, job.id, 'upsert'
  from (values (old_workspace, old_job), (new_workspace, new_job)) affected(workspace_id, job_id)
  join public."website-jobs" job on job.id = affected.job_id and job.workspace_id = affected.workspace_id
  join public."website-clickup-integrations" integration on integration.workspace_id = job.workspace_id
    and integration.target_client_id = job.client_id and integration.enabled
  where job.archived_at is null
    and exists (
      select 1 from public."website-production-team" member
      where member.workspace_id = job.workspace_id and member.is_active and member.is_primary_videographer
        and member.user_id = any(job.assignee_ids)
    )
  on conflict (workspace_id, job_id) where status in ('pending', 'retry')
  do update set operation = excluded.operation, status = 'pending', attempts = 0,
    available_at = now(), processing_started_at = null, completed_at = null, last_error = null;
  return null;
end;
$$;

revoke all on function "website-private"."website-queue-clickup-task-progress"() from public, anon, authenticated;
drop trigger if exists "website-job-tasks-clickup-progress" on public."website-job-tasks";
create trigger "website-job-tasks-clickup-progress"
after insert or delete or update of workspace_id, job_id, status_id, archived_at, source_deliverable_id
on public."website-job-tasks"
for each row execute function "website-private"."website-queue-clickup-task-progress"();
