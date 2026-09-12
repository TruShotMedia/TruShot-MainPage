-- Date-aware native calendar reminders for TruShot operations.
-- Supabase Cron invokes the protected application route every 15 minutes so
-- reminder precision does not depend on the Vercel Hobby cron restrictions.

alter table public."website-jobs"
  add column if not exists shoot_time time without time zone,
  add column if not exists due_time time without time zone;

alter table public."website-job-tasks"
  add column if not exists due_time time without time zone;

alter table public."website-campaign-assets"
  add column if not exists start_time time without time zone,
  add column if not exists due_time time without time zone;

create table if not exists public."website-calendar-reminder-settings" (
  workspace_id uuid primary key,
  enabled boolean not null default true,
  default_event_time time without time zone not null default '09:00',
  lead_minutes integer not null default 120,
  send_at_event_time boolean not null default true,
  notify_job_starts boolean not null default true,
  notify_job_deadlines boolean not null default true,
  notify_task_deadlines boolean not null default true,
  notify_campaign_assets boolean not null default true,
  timezone text not null default 'Australia/Brisbane',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-calendar-reminder-settings-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-calendar-reminder-settings-lead-check"
    check (lead_minutes between 15 and 10080),
  constraint "website-calendar-reminder-settings-timezone-check"
    check (timezone = 'Australia/Brisbane')
);

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
  constraint "website-calendar-reminder-deliveries-event-check"
    check (event_kind in ('job_start', 'job_due', 'task_due', 'campaign_start', 'campaign_due')),
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

create index if not exists "website-jobs-reminder-dates-idx"
  on public."website-jobs" (workspace_id, shoot_date, due_date)
  where archived_at is null and (shoot_date is not null or due_date is not null);

create index if not exists "website-job-tasks-reminder-due-idx"
  on public."website-job-tasks" (workspace_id, due_date)
  where archived_at is null and due_date is not null;

create index if not exists "website-campaign-assets-reminder-dates-idx"
  on public."website-campaign-assets" (workspace_id, start_date, due_date)
  where archived_at is null and (start_date is not null or due_date is not null);

drop trigger if exists "website-calendar-reminder-settings-updated-at" on public."website-calendar-reminder-settings";
create trigger "website-calendar-reminder-settings-updated-at"
before update on public."website-calendar-reminder-settings"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-calendar-reminder-settings" enable row level security;
alter table public."website-calendar-reminder-deliveries" enable row level security;

drop policy if exists "website-calendar-reminder-settings-member-select" on public."website-calendar-reminder-settings";
create policy "website-calendar-reminder-settings-member-select"
on public."website-calendar-reminder-settings"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

drop policy if exists "website-calendar-reminder-settings-member-update" on public."website-calendar-reminder-settings";
create policy "website-calendar-reminder-settings-member-update"
on public."website-calendar-reminder-settings"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

drop policy if exists "website-calendar-reminder-deliveries-member-select" on public."website-calendar-reminder-deliveries";
create policy "website-calendar-reminder-deliveries-member-select"
on public."website-calendar-reminder-deliveries"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-calendar-reminder-settings", public."website-calendar-reminder-deliveries"
from anon, authenticated, service_role;
grant select, update on public."website-calendar-reminder-settings" to authenticated;
grant select on public."website-calendar-reminder-deliveries" to authenticated;
grant select, insert, update, delete on
  public."website-calendar-reminder-settings",
  public."website-calendar-reminder-deliveries"
to service_role;
grant select on
  public."website-jobs",
  public."website-clients",
  public."website-campaigns",
  public."website-job-statuses",
  public."website-job-tasks",
  public."website-task-statuses",
  public."website-campaign-assets",
  public."website-push-subscriptions"
to service_role;

insert into public."website-calendar-reminder-settings" (workspace_id)
values ('11111111-1111-4111-8111-111111111111')
on conflict (workspace_id) do nothing;

-- Keep the lightweight scheduler beside the data. The shared secret is read
-- from Supabase Vault at runtime and is provisioned outside source control.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

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
