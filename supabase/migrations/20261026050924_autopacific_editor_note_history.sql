-- Durable, editable work notes for the full-screen AutoPacific record editor.
-- Existing job note text is retained on the job itself and seeded into this
-- timeline so no internal context is lost during the editor upgrade.

create table public."website-work-record-notes" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  record_kind text not null,
  job_id uuid,
  task_id uuid,
  body text not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-work-record-notes-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-work-record-notes-job-fkey"
    foreign key (job_id) references public."website-jobs" (id) on delete cascade,
  constraint "website-work-record-notes-task-fkey"
    foreign key (task_id) references public."website-job-tasks" (id) on delete cascade,
  constraint "website-work-record-notes-kind-check"
    check (
      (record_kind = 'job' and job_id is not null and task_id is null)
      or (record_kind = 'task' and task_id is not null and job_id is null)
    ),
  constraint "website-work-record-notes-body-check"
    check (char_length(btrim(body)) between 1 and 4000)
);

create index "website-work-record-notes-job-idx"
  on public."website-work-record-notes" (workspace_id, job_id, created_at);

create index "website-work-record-notes-task-idx"
  on public."website-work-record-notes" (workspace_id, task_id, created_at);

alter table public."website-work-record-notes" enable row level security;

create policy "website-work-record-notes-workspace-all"
on public."website-work-record-notes"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-work-record-notes" from anon, authenticated, service_role;
grant select, insert, update on public."website-work-record-notes" to authenticated, service_role;

insert into public."website-work-record-notes" (
  workspace_id, record_kind, job_id, body, created_by, updated_by, created_at, updated_at
)
select
  job.workspace_id,
  'job',
  job.id,
  btrim(job.notes),
  job.created_by,
  job.updated_by,
  job.created_at,
  job.updated_at
from public."website-jobs" job
where nullif(btrim(coalesce(job.notes, '')), '') is not null;

-- A rescheduled record is immutable history. If an old ClickUp webhook is
-- replayed after a CRM delay, it must not make that source actionable again.
update public."website-jobs" source
set status_id = delayed.id,
    delivered_at = null
from public."website-job-delay-history" history
join public."website-job-statuses" delayed
  on delayed.workspace_id = history.workspace_id
 and delayed.key = 'delayed'
 and delayed.is_active
where source.id = history.source_job_id
  and source.workspace_id = history.workspace_id
  and source.status_id <> delayed.id;

update public."website-job-tasks" source
set status_id = delayed.id,
    completed_at = null
from public."website-task-delay-history" history
join public."website-task-statuses" delayed
  on delayed.workspace_id = history.workspace_id
 and delayed.key = 'delayed'
 and delayed.is_active
where source.id = history.source_task_id
  and source.workspace_id = history.workspace_id
  and source.status_id <> delayed.id;

-- A CRM successor uses the 'scheduled' status. In ClickUp that is a fresh
-- TO DO, not a previously captured asset.
update public."website-clickup-integrations"
set status_mapping = jsonb_set(
  coalesce(status_mapping, '{}'::jsonb),
  '{scheduled}',
  to_jsonb('TO DO'::text),
  true
)
where enabled;

comment on table public."website-work-record-notes" is
  'Workspace-scoped editable note timeline for jobs and tasks.';
