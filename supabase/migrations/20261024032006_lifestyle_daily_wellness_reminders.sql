-- Daily Lifestyle accountability reminders, independent of workout days.

alter table public."website-lifestyle-profiles"
  add column if not exists daily_gym_reminder_enabled boolean not null default true,
  add column if not exists hydration_reminders_enabled boolean not null default true;

create table public."website-lifestyle-wellness-reminder-deliveries" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces" (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder_date date not null,
  reminder_slot text not null,
  scheduled_for timestamptz not null,
  status text not null default 'processing',
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  constraint "website-lifestyle-wellness-reminders-dedupe-key" unique (user_id, reminder_date, reminder_slot),
  constraint "website-lifestyle-wellness-reminders-slot-check" check (reminder_slot in ('gym', 'hydration-morning', 'hydration-afternoon')),
  constraint "website-lifestyle-wellness-reminders-status-check" check (status in ('processing', 'sent', 'failed')),
  constraint "website-lifestyle-wellness-reminders-count-check" check (delivered_count >= 0 and failed_count >= 0),
  constraint "website-lifestyle-wellness-reminders-error-check" check (error_message is null or char_length(error_message) <= 1000)
);

create index "website-lifestyle-wellness-reminders-scheduled-idx"
  on public."website-lifestyle-wellness-reminder-deliveries" (scheduled_for desc);
create index "website-lifestyle-wellness-reminders-workspace-idx"
  on public."website-lifestyle-wellness-reminder-deliveries" (workspace_id);

alter table public."website-lifestyle-wellness-reminder-deliveries" enable row level security;

create policy "website-lifestyle-wellness-reminders-service-only"
on public."website-lifestyle-wellness-reminder-deliveries" for all to service_role
using (true)
with check (true);

revoke all on public."website-lifestyle-wellness-reminder-deliveries" from anon, authenticated, service_role;
grant select, insert, update, delete on public."website-lifestyle-wellness-reminder-deliveries" to service_role;

grant select, update on public."website-lifestyle-profiles" to service_role;
