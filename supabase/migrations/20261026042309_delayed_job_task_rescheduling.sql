-- Durable job and task rescheduling chains.
-- A delay never overwrites the original record: it closes the source as
-- Delayed, creates a scheduled successor, and records the reason/date edge.

insert into public."website-job-statuses" (workspace_id, key, label, color, position, is_active, is_closed)
select id, 'delayed', 'Delayed', '#C45A45', 45, true, true
from public."website-workspaces"
on conflict (workspace_id, key) do update set
  label = excluded.label,
  color = excluded.color,
  position = excluded.position,
  is_active = true,
  is_closed = true;

insert into public."website-task-statuses" (workspace_id, key, label, color, position, is_active, is_open)
select id, 'delayed', 'Delayed', '#C45A45', 55, true, false
from public."website-workspaces"
on conflict (workspace_id, key) do update set
  label = excluded.label,
  color = excluded.color,
  position = excluded.position,
  is_active = true,
  is_open = false;

create table public."website-job-delay-history" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  source_job_id uuid not null,
  successor_job_id uuid not null,
  reason text not null,
  source_shoot_date date,
  source_due_date date,
  rescheduled_shoot_date date not null,
  rescheduled_due_date date,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint "website-job-delay-history-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-job-delay-history-source-job-fkey"
    foreign key (source_job_id) references public."website-jobs" (id) on delete restrict,
  constraint "website-job-delay-history-successor-job-fkey"
    foreign key (successor_job_id) references public."website-jobs" (id) on delete restrict,
  constraint "website-job-delay-history-source-successor-distinct"
    check (source_job_id <> successor_job_id),
  constraint "website-job-delay-history-reason-check"
    check (char_length(btrim(reason)) between 2 and 4000),
  constraint "website-job-delay-history-date-check"
    check (rescheduled_due_date is null or rescheduled_due_date >= rescheduled_shoot_date),
  constraint "website-job-delay-history-source-key" unique (workspace_id, source_job_id),
  constraint "website-job-delay-history-successor-key" unique (workspace_id, successor_job_id)
);

create table public."website-task-delay-history" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  source_task_id uuid not null,
  successor_task_id uuid not null,
  reason text not null,
  source_due_date date,
  rescheduled_due_date date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint "website-task-delay-history-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-task-delay-history-source-task-fkey"
    foreign key (source_task_id) references public."website-job-tasks" (id) on delete restrict,
  constraint "website-task-delay-history-successor-task-fkey"
    foreign key (successor_task_id) references public."website-job-tasks" (id) on delete restrict,
  constraint "website-task-delay-history-source-successor-distinct"
    check (source_task_id <> successor_task_id),
  constraint "website-task-delay-history-reason-check"
    check (char_length(btrim(reason)) between 2 and 4000),
  constraint "website-task-delay-history-source-key" unique (workspace_id, source_task_id),
  constraint "website-task-delay-history-successor-key" unique (workspace_id, successor_task_id)
);

create index "website-job-delay-history-successor-idx"
  on public."website-job-delay-history" (workspace_id, successor_job_id, created_at);

create index "website-task-delay-history-successor-idx"
  on public."website-task-delay-history" (workspace_id, successor_task_id, created_at);

alter table public."website-job-delay-history" enable row level security;
alter table public."website-task-delay-history" enable row level security;

create policy "website-job-delay-history-workspace-all"
on public."website-job-delay-history"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-task-delay-history-workspace-all"
on public."website-task-delay-history"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-job-delay-history" from anon, authenticated, service_role;
revoke all on public."website-task-delay-history" from anon, authenticated, service_role;

grant select, insert, update, delete on public."website-job-delay-history" to authenticated, service_role;
grant select, insert, update, delete on public."website-task-delay-history" to authenticated, service_role;

update public."website-clickup-integrations"
set status_mapping = jsonb_set(coalesce(status_mapping, '{}'::jsonb), '{delayed}', to_jsonb('DELAYED'::text), true)
where not (status_mapping ? 'delayed');

create or replace function public."website-delay-job"(
  p_source_job_id uuid,
  p_rescheduled_shoot_date date,
  p_reason text
)
returns table (source_job_id uuid, successor_job_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
  v_delayed_status_id uuid;
  v_scheduled_status_id uuid;
  v_successor_id uuid;
  v_rescheduled_due_date date;
  v_source_status_closed boolean;
begin
  if p_rescheduled_shoot_date is null then
    raise exception 'Choose the new shoot date before submitting this delay.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 2 and 4000 then
    raise exception 'Add a short delay reason before submitting.';
  end if;

  select job.*
  into v_source
  from public."website-jobs" job
  where job.id = p_source_job_id
    and job.archived_at is null
  for update;

  if not found then
    raise exception 'That job is no longer available.';
  end if;
  if not (select "website-private"."website-has-workspace-access"(v_source.workspace_id)) then
    raise exception 'You do not have access to this job.';
  end if;
  select status.is_closed into v_source_status_closed
  from public."website-job-statuses" status
  where status.id = v_source.status_id
    and status.workspace_id = v_source.workspace_id;
  if coalesce(v_source_status_closed, false) then
    raise exception 'Only an active job can be delayed.';
  end if;
  if exists (
    select 1 from public."website-job-delay-history" history
    where history.workspace_id = v_source.workspace_id
      and history.source_job_id = v_source.id
  ) then
    raise exception 'This job has already been delayed. Open its rescheduled successor to delay it again.';
  end if;

  select status.id into v_delayed_status_id
  from public."website-job-statuses" status
  where status.workspace_id = v_source.workspace_id
    and status.key = 'delayed'
    and status.is_active;
  if v_delayed_status_id is null then
    raise exception 'The Delayed job status is unavailable.';
  end if;

  select status.id into v_scheduled_status_id
  from public."website-job-statuses" status
  where status.workspace_id = v_source.workspace_id
    and status.key = 'scheduled'
    and status.is_active
    and not status.is_closed;
  if v_scheduled_status_id is null then
    select status.id into v_scheduled_status_id
    from public."website-job-statuses" status
    where status.workspace_id = v_source.workspace_id
      and status.is_active
      and not status.is_closed
    order by status.position
    limit 1;
  end if;
  if v_scheduled_status_id is null then
    raise exception 'An active open job status is required to reschedule this job.';
  end if;

  if v_source.shoot_date is not null and v_source.due_date is not null then
    v_rescheduled_due_date := p_rescheduled_shoot_date + (v_source.due_date - v_source.shoot_date);
  elsif v_source.due_date is not null then
    v_rescheduled_due_date := p_rescheduled_shoot_date;
  else
    v_rescheduled_due_date := null;
  end if;

  insert into public."website-jobs" (
    workspace_id, client_id, status_id, package_id, title, job_number,
    description, shoot_date, shoot_time, due_date, due_time, delivered_at,
    location, photos_delivered, hours_basis, legacy_hours_snapshot,
    package_snapshot, notes, delivery_url, created_by, updated_by
  ) values (
    v_source.workspace_id, v_source.client_id, v_scheduled_status_id,
    v_source.package_id, v_source.title, null, v_source.description,
    p_rescheduled_shoot_date, v_source.shoot_time, v_rescheduled_due_date,
    v_source.due_time, null, v_source.location, 0, v_source.hours_basis,
    v_source.legacy_hours_snapshot, v_source.package_snapshot, v_source.notes,
    v_source.delivery_url, auth.uid(), auth.uid()
  ) returning id into v_successor_id;

  update public."website-jobs"
  set status_id = v_delayed_status_id,
      delivered_at = null,
      updated_by = auth.uid()
  where id = v_source.id
    and workspace_id = v_source.workspace_id;

  insert into public."website-job-delay-history" (
    workspace_id, source_job_id, successor_job_id, reason,
    source_shoot_date, source_due_date, rescheduled_shoot_date,
    rescheduled_due_date, created_by
  ) values (
    v_source.workspace_id, v_source.id, v_successor_id, btrim(p_reason),
    v_source.shoot_date, v_source.due_date, p_rescheduled_shoot_date,
    v_rescheduled_due_date, auth.uid()
  );

  return query select v_source.id, v_successor_id;
end;
$$;

create or replace function public."website-delay-task"(
  p_source_task_id uuid,
  p_rescheduled_due_date date,
  p_reason text
)
returns table (source_task_id uuid, successor_task_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
  v_delayed_status_id uuid;
  v_not_started_status_id uuid;
  v_successor_id uuid;
  v_position numeric;
  v_source_status_open boolean;
begin
  if p_rescheduled_due_date is null then
    raise exception 'Choose the new due date before submitting this delay.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 2 and 4000 then
    raise exception 'Add a short delay reason before submitting.';
  end if;

  select task.*
  into v_source
  from public."website-job-tasks" task
  where task.id = p_source_task_id
    and task.archived_at is null
  for update;

  if not found then
    raise exception 'That task is no longer available.';
  end if;
  if not (select "website-private"."website-has-workspace-access"(v_source.workspace_id)) then
    raise exception 'You do not have access to this task.';
  end if;
  select status.is_open into v_source_status_open
  from public."website-task-statuses" status
  where status.id = v_source.status_id
    and status.workspace_id = v_source.workspace_id;
  if not coalesce(v_source_status_open, false) then
    raise exception 'Only an active task can be delayed.';
  end if;
  if exists (
    select 1 from public."website-task-delay-history" history
    where history.workspace_id = v_source.workspace_id
      and history.source_task_id = v_source.id
  ) then
    raise exception 'This task has already been delayed. Open its rescheduled successor to delay it again.';
  end if;

  select status.id into v_delayed_status_id
  from public."website-task-statuses" status
  where status.workspace_id = v_source.workspace_id
    and status.key = 'delayed'
    and status.is_active;
  if v_delayed_status_id is null then
    raise exception 'The Delayed task status is unavailable.';
  end if;

  select status.id into v_not_started_status_id
  from public."website-task-statuses" status
  where status.workspace_id = v_source.workspace_id
    and status.key = 'not_started'
    and status.is_active
    and status.is_open;
  if v_not_started_status_id is null then
    select status.id into v_not_started_status_id
    from public."website-task-statuses" status
    where status.workspace_id = v_source.workspace_id
      and status.is_active
      and status.is_open
    order by status.position
    limit 1;
  end if;
  if v_not_started_status_id is null then
    raise exception 'An active open task status is required to reschedule this task.';
  end if;

  select coalesce(max(task.position), 0) + 1000 into v_position
  from public."website-job-tasks" task
  where task.workspace_id = v_source.workspace_id
    and task.status_id = v_not_started_status_id
    and task.archived_at is null;

  insert into public."website-job-tasks" (
    workspace_id, job_id, status_id, title, description, asset_type, priority,
    hours, due_date, due_time, completed_at, assignee_id, position, external_url,
    created_by, updated_by
  ) values (
    v_source.workspace_id, v_source.job_id, v_not_started_status_id,
    v_source.title, v_source.description, v_source.asset_type, v_source.priority,
    v_source.hours, p_rescheduled_due_date, v_source.due_time, null,
    v_source.assignee_id, v_position, v_source.external_url, auth.uid(), auth.uid()
  ) returning id into v_successor_id;

  update public."website-job-tasks"
  set status_id = v_delayed_status_id,
      completed_at = null,
      updated_by = auth.uid()
  where id = v_source.id
    and workspace_id = v_source.workspace_id;

  insert into public."website-task-delay-history" (
    workspace_id, source_task_id, successor_task_id, reason,
    source_due_date, rescheduled_due_date, created_by
  ) values (
    v_source.workspace_id, v_source.id, v_successor_id, btrim(p_reason),
    v_source.due_date, p_rescheduled_due_date, auth.uid()
  );

  return query select v_source.id, v_successor_id;
end;
$$;

revoke all on function public."website-delay-job"(uuid, date, text) from public, anon;
revoke all on function public."website-delay-task"(uuid, date, text) from public, anon;
grant execute on function public."website-delay-job"(uuid, date, text) to authenticated, service_role;
grant execute on function public."website-delay-task"(uuid, date, text) to authenticated, service_role;

comment on table public."website-job-delay-history" is
  'Immutable links between delayed jobs and their rescheduled successors.';
comment on table public."website-task-delay-history" is
  'Immutable links between delayed tasks and their rescheduled successors.';
