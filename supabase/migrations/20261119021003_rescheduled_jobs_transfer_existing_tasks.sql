-- Transfer original task identities, rather than regenerating a second set.
-- This private invoker is reachable only from the already-authorised delay RPC
-- (or explicit owner maintenance). It cannot be called through the Data API.
create function "website-private"."website-transfer-rescheduled-job-tasks"(
  p_workspace_id uuid, p_source_job_id uuid, p_successor_job_id uuid
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare history record; destination record; moved integer;
begin
  perform id from public."website-jobs"
    where workspace_id=p_workspace_id and id in (p_source_job_id,p_successor_job_id)
    order by id for no key update;
  select h.* into history from public."website-job-delay-history" h
    join public."website-jobs" source on source.workspace_id=h.workspace_id and source.id=h.source_job_id
    join public."website-jobs" successor on successor.workspace_id=h.workspace_id and successor.id=h.successor_job_id
    where h.workspace_id=p_workspace_id and h.source_job_id=p_source_job_id and h.successor_job_id=p_successor_job_id
      and source.client_id is not distinct from successor.client_id
      and source.archived_at is null and successor.archived_at is null;
  if not found then raise exception 'A matching reschedule history link is required before moving tasks.'; end if;
  if exists(select 1 from public."website-job-delay-history" h
    where h.workspace_id=p_workspace_id and h.source_job_id=p_successor_job_id) then
    raise exception 'Move tasks to the latest rescheduled job, not an older history entry.';
  end if;
  select * into destination from public."website-jobs" where workspace_id=p_workspace_id and id=p_successor_job_id;
  -- Never overwrite a task somebody has already created on the destination.
  if exists(select 1 from public."website-job-tasks" source
    join public."website-job-tasks" successor on successor.workspace_id=source.workspace_id
      and successor.job_id=p_successor_job_id and successor.source_deliverable_id=source.source_deliverable_id
    where source.workspace_id=p_workspace_id and source.job_id=p_source_job_id and source.source_deliverable_id is not null) then
    raise exception 'The rescheduled job already has tasks for these deliverables. Review them before transferring.';
  end if;
  update public."website-job-tasks" task set
    job_id=p_successor_job_id,
    due_date=case
      when task.archived_at is not null or not status.is_open then task.due_date
      -- A task explicitly delayed on its own keeps that separately chosen date.
      when exists(select 1 from public."website-task-delay-history" h
        where h.workspace_id=task.workspace_id and h.successor_task_id=task.id) then task.due_date
      when not task.due_date_is_override then destination.due_date
      when task.due_date is null or history.source_shoot_date is null then task.due_date
      else task.due_date+(history.rescheduled_shoot_date-history.source_shoot_date)
    end,
    updated_by=coalesce(auth.uid(),task.updated_by)
    from public."website-task-statuses" status
    where task.workspace_id=p_workspace_id and task.job_id=p_source_job_id
      and status.workspace_id=task.workspace_id and status.id=task.status_id;
  get diagnostics moved=row_count;
  -- Only the parent/date/audit fields change. IDs, statuses, completion and
  -- approval timestamps, hours, assignments, comments and all task FKs survive.
  -- Archived tasks also move, remaining archived, so their deliverables cannot
  -- accidentally regenerate an active replacement on the new job.
  return moved;
end $$;
revoke all on function "website-private"."website-transfer-rescheduled-job-tasks"(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public."website-delay-job"(
  p_source_job_id uuid, p_rescheduled_shoot_date date, p_reason text
)
returns table(source_job_id uuid, successor_job_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_source public."website-jobs"%rowtype;
  v_delayed_status_id uuid; v_scheduled_status_id uuid; v_successor_id uuid;
  v_rescheduled_due_date date; v_source_status_closed boolean; v_deliverables jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Sign in before rescheduling a job.'; end if;
  if p_rescheduled_shoot_date is null then raise exception 'Choose the new shoot date before submitting this delay.'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 2 and 4000 then raise exception 'Add a short delay reason before submitting.'; end if;
  select * into v_source from public."website-jobs" job
    where job.id=p_source_job_id and job.archived_at is null for update;
  if not found then raise exception 'That job is no longer available.'; end if;
  if not (select "website-private"."website-can-access-production-job"(v_source.workspace_id,v_source.id)) then
    raise exception 'You do not have access to this job.';
  end if;
  select status.is_closed into v_source_status_closed from public."website-job-statuses" status
    where status.id=v_source.status_id and status.workspace_id=v_source.workspace_id;
  if coalesce(v_source_status_closed,false) then raise exception 'Only an active job can be delayed.'; end if;
  if exists(select 1 from public."website-job-delay-history" h where h.workspace_id=v_source.workspace_id and h.source_job_id=v_source.id) then
    raise exception 'This job has already been delayed. Open its rescheduled successor to delay it again.';
  end if;
  -- Finish any concurrent task edit before deciding which dates may shift.
  perform task.id from public."website-job-tasks" task
    where task.workspace_id=v_source.workspace_id and task.job_id=v_source.id order by task.id for update;
  select id into v_delayed_status_id from public."website-job-statuses"
    where workspace_id=v_source.workspace_id and key='delayed' and is_active;
  if v_delayed_status_id is null then raise exception 'The Delayed job status is unavailable.'; end if;
  select id into v_scheduled_status_id from public."website-job-statuses"
    where workspace_id=v_source.workspace_id and key='scheduled' and is_active and not is_closed;
  if v_scheduled_status_id is null then
    select id into v_scheduled_status_id from public."website-job-statuses"
      where workspace_id=v_source.workspace_id and is_active and not is_closed order by position limit 1;
  end if;
  if v_scheduled_status_id is null then raise exception 'An active open job status is required to reschedule this job.'; end if;
  v_rescheduled_due_date:=case
    when v_source.shoot_date is not null and v_source.due_date is not null then p_rescheduled_shoot_date+(v_source.due_date-v_source.shoot_date)
    when v_source.due_date is not null then p_rescheduled_shoot_date else null end;
  -- Shift pending dated deliverables by the same number of days as the shoot.
  -- Completed/archived work and independently rescheduled tasks retain dates.
  select coalesce(jsonb_agg(case
    when item->>'date' is null or v_source.shoot_date is null or exists(
      select 1 from public."website-job-tasks" task
      join public."website-task-statuses" status on status.id=task.status_id and status.workspace_id=task.workspace_id
      where task.workspace_id=v_source.workspace_id and task.job_id=v_source.id and task.source_deliverable_id=(item->>'id')::uuid
        and (task.archived_at is not null or not status.is_open or exists(
          select 1 from public."website-task-delay-history" h where h.workspace_id=task.workspace_id and h.successor_task_id=task.id)))
      then item
    else jsonb_set(item,'{date}',to_jsonb(to_char((item->>'date')::date+(p_rescheduled_shoot_date-v_source.shoot_date),'YYYY-MM-DD')))
    end order by position),'[]'::jsonb) into v_deliverables
    from jsonb_array_elements(v_source.deliverables) with ordinality as items(item,position);
  -- Even callers using SET CONSTRAINTS ALL IMMEDIATE must let the task move
  -- finish before the deliverable generator checks for missing tasks.
  set constraints public."website-jobs-auto-deliverable-tasks" deferred;
  insert into public."website-jobs"(
    workspace_id,client_id,status_id,package_id,title,job_number,description,shoot_date,shoot_time,due_date,due_time,delivered_at,
    location,location_details,location_original,photos_delivered,hours_basis,legacy_hours_snapshot,package_snapshot,notes,delivery_url,
    key_deliverables,deliverables,brief_details,brief_history,shoot_end_time,campaign_week_id,assignee_ids,priority,created_by,updated_by
  ) values (
    v_source.workspace_id,v_source.client_id,v_scheduled_status_id,v_source.package_id,v_source.title,null,v_source.description,
    p_rescheduled_shoot_date,v_source.shoot_time,v_rescheduled_due_date,v_source.due_time,null,
    v_source.location,v_source.location_details,v_source.location_original,0,v_source.hours_basis,v_source.legacy_hours_snapshot,
    v_source.package_snapshot,v_source.notes,v_source.delivery_url,v_source.key_deliverables,v_deliverables,v_source.brief_details,
    v_source.brief_history,v_source.shoot_end_time,v_source.campaign_week_id,v_source.assignee_ids,v_source.priority,auth.uid(),auth.uid()
  ) returning id into v_successor_id;
  update public."website-jobs" set status_id=v_delayed_status_id,delivered_at=null,updated_by=auth.uid()
    where id=v_source.id and workspace_id=v_source.workspace_id;
  insert into public."website-job-delay-history"(
    workspace_id,source_job_id,successor_job_id,reason,source_shoot_date,source_due_date,rescheduled_shoot_date,rescheduled_due_date,created_by
  ) values (
    v_source.workspace_id,v_source.id,v_successor_id,btrim(p_reason),v_source.shoot_date,v_source.due_date,
    p_rescheduled_shoot_date,v_rescheduled_due_date,auth.uid()
  );
  -- History exists first so the old job cannot be reopened by task rollups.
  perform "website-private"."website-transfer-rescheduled-job-tasks"(v_source.workspace_id,v_source.id,v_successor_id);
  return query select v_source.id,v_successor_id;
end $$;
revoke all on function public."website-delay-job"(uuid,date,text) from public,anon;
grant execute on function public."website-delay-job"(uuid,date,text) to authenticated,service_role;
