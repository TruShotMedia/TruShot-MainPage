-- AutoPacific jobs follow their least-advanced active task after Planning.
-- No polling, new public RPC, RLS changes, or writes to unrelated clients.
create function "website-private"."website-linked-task-job-status"(p_workspace_id uuid, p_job_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare least_stage integer; target_key text; target_id uuid;
begin
  select min(case status.key
    when 'not_started' then 0 when 'in_progress' then 1
    when 'ready_for_revision' then 2 when 'final_draft_notes' then 2 when 'ready_to_post' then 2
    when 'posted_done' then 3 else 0 end)
  into least_stage
  from public."website-job-tasks" task
  join public."website-task-statuses" status on status.id=task.status_id and status.workspace_id=task.workspace_id
  where task.workspace_id=p_workspace_id and task.job_id=p_job_id
    and task.archived_at is null and status.key<>'delayed';
  if least_stage is null then return null; end if;
  target_key := (array['scheduled','production','review','delivered'])[least_stage+1];
  select id into target_id from public."website-job-statuses"
    where workspace_id=p_workspace_id and key=target_key and is_active;
  if target_id is null then raise exception 'The % job status is unavailable.',target_key; end if;
  return target_id;
end $$;
revoke all on function "website-private"."website-linked-task-job-status"(uuid,uuid) from public,anon,authenticated,service_role;

-- The parent write has already passed its original RLS policy. Read all of its
-- tasks even if the current member only has permission to approve some of them.
-- Run before the existing delivered_at trigger, so reopening clears that date.
create function "website-private"."website-enforce-task-job-status"()
returns trigger language plpgsql security definer set search_path = '' as $$
declare current_key text; target_id uuid;
begin
  if auth.uid() is null and current_setting('role',true) in ('anon','authenticated') then
    raise exception 'Sign in before updating a job.';
  end if;
  if new.archived_at is not null or not exists(
    select 1 from public."website-clients" client where client.workspace_id=new.workspace_id
      and client.id=new.client_id and lower(btrim(client.name))='autopacific group'
  ) then return new; end if;
  select key into current_key from public."website-job-statuses" where workspace_id=new.workspace_id and id=new.status_id;
  -- Never resurrect the source of a reschedule chain, even from an older client.
  if exists(select 1 from public."website-job-delay-history" history where history.workspace_id=new.workspace_id and history.source_job_id=new.id) then
    select id into new.status_id from public."website-job-statuses" where workspace_id=new.workspace_id and key='delayed' and is_active;
    return new;
  end if;
  -- Planning is the team's manual brief/readiness gate. Delaying uses its own
  -- atomic history/successor workflow and must remain possible with open tasks.
  if current_key in ('planning','delayed') then return new; end if;
  target_id := "website-private"."website-linked-task-job-status"(new.workspace_id,new.id);
  if target_id is not null then new.status_id := target_id; end if;
  return new;
end $$;
revoke all on function "website-private"."website-enforce-task-job-status"() from public,anon,authenticated,service_role;
create trigger "website-jobs-00-task-status"
  before insert or update of status_id,client_id,workspace_id,archived_at on public."website-jobs"
  for each row execute function "website-private"."website-enforce-task-job-status"();

create function "website-private"."website-rollup-task-job-status"()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_job uuid; new_job uuid; parent record; target_id uuid;
begin
  if auth.uid() is null and current_setting('role',true) in ('anon','authenticated') then
    raise exception 'Sign in before updating tasks.';
  end if;
  if tg_op='UPDATE' and row(old.job_id,old.workspace_id,old.status_id,old.archived_at)
    is not distinct from row(new.job_id,new.workspace_id,new.status_id,new.archived_at) then return null; end if;
  if tg_op<>'INSERT' then old_job:=old.job_id; end if;
  if tg_op<>'DELETE' then new_job:=new.job_id; end if;
  -- Lock both parents in the same order on reparenting. NO KEY UPDATE remains
  -- compatible with the FK key-share locks from concurrent child inserts.
  for parent in
    select job.id,job.workspace_id,job.status_id,status.key
    from public."website-jobs" job
    join public."website-clients" client on client.id=job.client_id and client.workspace_id=job.workspace_id
    join public."website-job-statuses" status on status.id=job.status_id and status.workspace_id=job.workspace_id
    where job.id in (old_job,new_job) and job.archived_at is null
      and lower(btrim(client.name))='autopacific group'
    order by job.id for no key update of job
  loop
    if parent.key in ('planning','delayed') or exists(
      select 1 from public."website-job-delay-history" history
      where history.workspace_id=parent.workspace_id and history.source_job_id=parent.id
    ) then continue; end if;
    target_id := "website-private"."website-linked-task-job-status"(parent.workspace_id,parent.id);
    -- Removing the final active task returns control to the user, preserving
    -- the last stage rather than resetting a standalone job arbitrarily.
    if target_id is not null and target_id is distinct from parent.status_id then
      update public."website-jobs" set status_id=target_id,updated_by=coalesce(auth.uid(),updated_by)
        where workspace_id=parent.workspace_id and id=parent.id;
    end if;
  end loop;
  return null;
end $$;
revoke all on function "website-private"."website-rollup-task-job-status"() from public,anon,authenticated,service_role;
-- Acquire parent locks before the existing child ClickUp outbox trigger. The
-- normal parent trigger coalesces status changes into the same durable queue.
create trigger "website-job-tasks-00-status-rollup"
  after insert or delete or update of job_id,workspace_id,status_id,archived_at on public."website-job-tasks"
  for each row execute function "website-private"."website-rollup-task-job-status"();
