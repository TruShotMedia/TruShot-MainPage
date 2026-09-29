-- First-class CRM calendar events with per-event native push reminders.
-- All exposed objects retain the required website- prefix.

create table public."website-calendar-events" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  title text not null,
  description text,
  location text,
  start_date date not null,
  start_time time without time zone,
  end_date date not null,
  end_time time without time zone,
  is_all_day boolean not null default false,
  color text not null default '#1f5e41',
  reminder_offsets_minutes integer[] not null default '{}',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-calendar-events-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-calendar-events-created-by-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-calendar-events-updated-by-fkey"
    foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-calendar-events-title-check"
    check (char_length(btrim(title)) between 2 and 180),
  constraint "website-calendar-events-description-check"
    check (description is null or char_length(description) <= 4000),
  constraint "website-calendar-events-location-check"
    check (location is null or char_length(location) <= 300),
  constraint "website-calendar-events-color-check"
    check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint "website-calendar-events-reminders-check"
    check (
      cardinality(reminder_offsets_minutes) <= 6
      and reminder_offsets_minutes <@ array[0, 15, 30, 60, 120, 1440]::integer[]
    ),
  constraint "website-calendar-events-time-shape-check"
    check (
      (is_all_day and start_time is null and end_time is null)
      or (not is_all_day and start_time is not null and end_time is not null)
    ),
  constraint "website-calendar-events-window-check"
    check (
      end_date > start_date
      or (end_date = start_date and (is_all_day or end_time > start_time))
    )
);

create index "website-calendar-events-workspace-window-idx"
  on public."website-calendar-events" (workspace_id, start_date, end_date);

create index "website-calendar-events-created-by-idx"
  on public."website-calendar-events" (created_by)
  where created_by is not null;

create index "website-calendar-events-updated-by-idx"
  on public."website-calendar-events" (updated_by)
  where updated_by is not null;

create trigger "website-calendar-events-updated-at"
before update on public."website-calendar-events"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-calendar-events" enable row level security;

create policy "website-calendar-events-member-select"
on public."website-calendar-events"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-calendar-events-member-insert"
on public."website-calendar-events"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-calendar-events-member-update"
on public."website-calendar-events"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-calendar-events-member-delete"
on public."website-calendar-events"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-calendar-events" from anon, authenticated, service_role;
grant select, insert, update, delete on public."website-calendar-events" to authenticated;
grant select on public."website-calendar-events" to service_role;

-- Reconcile older production databases where reminder settings were created
-- before the delivery ledger was applied. The unique key is what guarantees
-- that a scheduled reminder can only be sent once.
create table if not exists public."website-calendar-reminder-deliveries" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  event_kind text not null,
  entity_id uuid not null,
  occurrence_at timestamptz not null,
  reminder_offset_minutes integer not null,
  status text not null default 'processing',
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint "website-calendar-reminder-deliveries-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-calendar-reminder-deliveries-offset-check"
    check (reminder_offset_minutes between 0 and 10080),
  constraint "website-calendar-reminder-deliveries-status-check"
    check (status in ('processing', 'sent', 'failed')),
  constraint "website-calendar-reminder-deliveries-counts-check"
    check (delivered_count >= 0 and failed_count >= 0),
  constraint "website-calendar-reminder-deliveries-error-check"
    check (error_message is null or char_length(error_message) <= 1000),
  constraint "website-calendar-reminder-deliveries-dedupe-key"
    unique (workspace_id, event_kind, entity_id, occurrence_at, reminder_offset_minutes)
);

create index if not exists "website-calendar-reminder-deliveries-recent-idx"
  on public."website-calendar-reminder-deliveries" (workspace_id, created_at desc);

alter table public."website-calendar-reminder-deliveries"
  drop constraint if exists "website-calendar-reminder-deliveries-event-check";

alter table public."website-calendar-reminder-deliveries"
  add constraint "website-calendar-reminder-deliveries-event-check"
  check (event_kind in (
    'job_start',
    'job_due',
    'task_due',
    'campaign_start',
    'campaign_due',
    'calendar_event_start'
  ));

alter table public."website-calendar-reminder-deliveries" enable row level security;

drop policy if exists "website-calendar-reminder-deliveries-member-select"
on public."website-calendar-reminder-deliveries";

create policy "website-calendar-reminder-deliveries-member-select"
on public."website-calendar-reminder-deliveries"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-calendar-reminder-deliveries" from anon, authenticated, service_role;
grant select on public."website-calendar-reminder-deliveries" to authenticated;
grant select, insert, update, delete on public."website-calendar-reminder-deliveries" to service_role;

-- Keep reminder delivery independent from an open browser session. The shared
-- secret is provisioned in Supabase Vault and Vercel outside source control.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'website-calendar-reminders';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'website-calendar-reminders',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://www.trushotmedia.com/api/cron/calendar-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce((
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'website-calendar-reminders-cron-secret'
        ), '')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 10000
    ) as request_id;
  $job$
);
