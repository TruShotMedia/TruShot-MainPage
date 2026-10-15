-- Isolated INGREIGN client portal, content presets, manual calendar entries and push delivery.

create table public."website-portal-users" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  portal_key text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-portal-users-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-portal-users-user-fkey"
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint "website-portal-users-key-check"
    check (portal_key ~ '^[a-z0-9-]{2,60}$'),
  constraint "website-portal-users-display-name-check"
    check (display_name is null or char_length(display_name) <= 120),
  constraint "website-portal-users-membership-key"
    unique (workspace_id, user_id, portal_key)
);

create index "website-portal-users-user-active-idx"
  on public."website-portal-users" (user_id, portal_key)
  where is_active;

create index "website-portal-users-workspace-idx"
  on public."website-portal-users" (workspace_id);

create index "website-portal-users-user-idx"
  on public."website-portal-users" (user_id);

create table public."website-ingreign-caption-presets" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  preset_key text not null,
  label text not null,
  caption text not null,
  generator_mode text not null default 'date_only',
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-ingreign-caption-presets-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-ingreign-caption-presets-key-check"
    check (preset_key in ('date_post', 'one_week', 'three_days', 'two_days', 'one_day', 'event_day')),
  constraint "website-ingreign-caption-presets-label-check"
    check (char_length(label) between 1 and 80),
  constraint "website-ingreign-caption-presets-caption-check"
    check (char_length(caption) between 1 and 4000),
  constraint "website-ingreign-caption-presets-mode-check"
    check (generator_mode in ('date_only', 'countdown_3', 'countdown_2', 'countdown_1')),
  constraint "website-ingreign-caption-presets-position-check"
    check (position between 0 and 100),
  constraint "website-ingreign-caption-presets-key-unique"
    unique (workspace_id, preset_key)
);

create table public."website-ingreign-manual-events" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  title text not null,
  calendar_label text not null,
  event_date date not null,
  preset_key text,
  generator_mode text not null default 'date_only',
  month_label text,
  day_label text,
  caption_override text,
  notification_enabled boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-ingreign-manual-events-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-ingreign-manual-events-creator-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-ingreign-manual-events-updater-fkey"
    foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-ingreign-manual-events-title-check"
    check (char_length(title) between 1 and 160),
  constraint "website-ingreign-manual-events-calendar-label-check"
    check (char_length(calendar_label) between 1 and 120),
  constraint "website-ingreign-manual-events-preset-check"
    check (preset_key is null or preset_key in ('date_post', 'one_week', 'three_days', 'two_days', 'one_day', 'event_day')),
  constraint "website-ingreign-manual-events-mode-check"
    check (generator_mode in ('date_only', 'countdown_3', 'countdown_2', 'countdown_1')),
  constraint "website-ingreign-manual-events-month-check"
    check (month_label is null or char_length(month_label) between 1 and 20),
  constraint "website-ingreign-manual-events-day-check"
    check (day_label is null or char_length(day_label) between 1 and 4),
  constraint "website-ingreign-manual-events-caption-check"
    check (caption_override is null or char_length(caption_override) <= 4000)
);

create index "website-ingreign-manual-events-date-idx"
  on public."website-ingreign-manual-events" (workspace_id, event_date);

create index "website-ingreign-manual-events-created-by-idx"
  on public."website-ingreign-manual-events" (created_by)
  where created_by is not null;

create index "website-ingreign-manual-events-updated-by-idx"
  on public."website-ingreign-manual-events" (updated_by)
  where updated_by is not null;

create table public."website-ingreign-push-subscriptions" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  expiration_time bigint,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-ingreign-push-subscriptions-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-ingreign-push-subscriptions-user-fkey"
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint "website-ingreign-push-subscriptions-endpoint-key" unique (endpoint),
  constraint "website-ingreign-push-subscriptions-endpoint-check"
    check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  constraint "website-ingreign-push-subscriptions-p256dh-check"
    check (char_length(p256dh) between 20 and 255),
  constraint "website-ingreign-push-subscriptions-auth-key-check"
    check (char_length(auth_key) between 10 and 255),
  constraint "website-ingreign-push-subscriptions-user-agent-check"
    check (user_agent is null or char_length(user_agent) <= 500)
);

create index "website-ingreign-push-subscriptions-user-idx"
  on public."website-ingreign-push-subscriptions" (workspace_id, user_id);

create index "website-ingreign-push-subscriptions-auth-user-idx"
  on public."website-ingreign-push-subscriptions" (user_id);

create table public."website-ingreign-notification-deliveries" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  schedule_key text not null,
  posting_date date not null,
  status text not null default 'processing',
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint "website-ingreign-notification-deliveries-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-ingreign-notification-deliveries-key-check"
    check (char_length(schedule_key) between 1 and 180),
  constraint "website-ingreign-notification-deliveries-status-check"
    check (status in ('processing', 'sent', 'failed')),
  constraint "website-ingreign-notification-deliveries-counts-check"
    check (delivered_count >= 0 and failed_count >= 0),
  constraint "website-ingreign-notification-deliveries-error-check"
    check (error_message is null or char_length(error_message) <= 1000),
  constraint "website-ingreign-notification-deliveries-dedupe-key"
    unique (workspace_id, schedule_key, posting_date)
);

create index "website-ingreign-notification-deliveries-recent-idx"
  on public."website-ingreign-notification-deliveries" (workspace_id, created_at desc);

create or replace function "website-private"."website-has-portal-access"(
  requested_workspace_id uuid,
  requested_portal_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."website-portal-users" portal_user
    where portal_user.workspace_id = requested_workspace_id
      and portal_user.user_id = (select auth.uid())
      and portal_user.portal_key = requested_portal_key
      and portal_user.is_active
  );
$$;

revoke all on function "website-private"."website-has-portal-access"(uuid, text) from public, anon;
grant execute on function "website-private"."website-has-portal-access"(uuid, text) to authenticated;

alter table public."website-portal-users" enable row level security;
alter table public."website-ingreign-caption-presets" enable row level security;
alter table public."website-ingreign-manual-events" enable row level security;
alter table public."website-ingreign-push-subscriptions" enable row level security;
alter table public."website-ingreign-notification-deliveries" enable row level security;

create policy "website-portal-users-own-select"
on public."website-portal-users"
for select to authenticated
using (user_id = (select auth.uid()) and is_active);

create policy "website-portal-users-admin-all"
on public."website-portal-users"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-ingreign-caption-presets-portal-select"
on public."website-ingreign-caption-presets"
for select to authenticated
using ((select "website-private"."website-has-portal-access"(workspace_id, 'ingreign')));

create policy "website-ingreign-caption-presets-admin-all"
on public."website-ingreign-caption-presets"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-ingreign-manual-events-portal-select"
on public."website-ingreign-manual-events"
for select to authenticated
using ((select "website-private"."website-has-portal-access"(workspace_id, 'ingreign')));

create policy "website-ingreign-manual-events-admin-all"
on public."website-ingreign-manual-events"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-ingreign-push-subscriptions-own-select"
on public."website-ingreign-push-subscriptions"
for select to authenticated
using (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-portal-access"(workspace_id, 'ingreign'))
);

create policy "website-ingreign-push-subscriptions-own-insert"
on public."website-ingreign-push-subscriptions"
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-portal-access"(workspace_id, 'ingreign'))
);

create policy "website-ingreign-push-subscriptions-own-update"
on public."website-ingreign-push-subscriptions"
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-portal-access"(workspace_id, 'ingreign'))
)
with check (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-portal-access"(workspace_id, 'ingreign'))
);

create policy "website-ingreign-push-subscriptions-own-delete"
on public."website-ingreign-push-subscriptions"
for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-portal-access"(workspace_id, 'ingreign'))
);

create policy "website-ingreign-notification-deliveries-admin-select"
on public."website-ingreign-notification-deliveries"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create trigger "website-portal-users-updated-at"
before update on public."website-portal-users"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-ingreign-caption-presets-updated-at"
before update on public."website-ingreign-caption-presets"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-ingreign-manual-events-updated-at"
before update on public."website-ingreign-manual-events"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-ingreign-push-subscriptions-updated-at"
before update on public."website-ingreign-push-subscriptions"
for each row execute function "website-private"."website-set-updated-at"();

revoke all on
  public."website-portal-users",
  public."website-ingreign-caption-presets",
  public."website-ingreign-manual-events",
  public."website-ingreign-push-subscriptions",
  public."website-ingreign-notification-deliveries"
from anon, authenticated, service_role;

grant select, insert, update, delete on
  public."website-portal-users",
  public."website-ingreign-caption-presets",
  public."website-ingreign-manual-events"
to authenticated;

grant select, insert, update, delete on public."website-ingreign-push-subscriptions" to authenticated;
grant select on public."website-ingreign-notification-deliveries" to authenticated;

grant select, insert, update, delete on
  public."website-portal-users",
  public."website-ingreign-caption-presets",
  public."website-ingreign-manual-events",
  public."website-ingreign-push-subscriptions",
  public."website-ingreign-notification-deliveries"
to service_role;

insert into public."website-portal-users" (workspace_id, user_id, portal_key, display_name)
select workspace.id, auth_user.id, 'ingreign', 'INGREIGN'
from public."website-workspaces" workspace
join auth.users auth_user on lower(auth_user.email) = 'thebuildof86@gmail.com'
where workspace.slug = 'trushot-media'
on conflict (workspace_id, user_id, portal_key)
do update set is_active = true, display_name = excluded.display_name;

insert into public."website-ingreign-caption-presets"
  (workspace_id, preset_key, label, caption, generator_mode, position)
select workspace.id, preset.preset_key, preset.label, preset.caption, preset.generator_mode, preset.position
from public."website-workspaces" workspace
cross join (values
  ('date_post', 'Date post', '{{MONTH}}🔥\n🔒 Lock it in! See ya there! 🫶🏻', 'date_only', 10),
  ('one_week', '1 week out', '🔥 One more week to go! 🔥\nSee you all there 🫶🏻', 'date_only', 20),
  ('three_days', '3 days', '3 days to go ⏳\nINGREIGN is almost here.\n\n6:30pm dinner, 7:30pm program\n\nMake plans, bring a friend, and we’ll see you there.', 'countdown_3', 30),
  ('two_days', '2 days', '🤍 2 days to go\n\nNot long now until INGREIGN.\n\n6:30pm dinner, 7:30pm program\n\nA night to gather, worship, and grow in faith together.\nWe can’t wait to see everyone there.', 'countdown_2', 40),
  ('one_day', '1 day', '1 day to go 🔥\nINGREIGN is tomorrow.\n\n6:30pm dinner, 7:30pm program\n\nBring a friend, and get ready for a beautiful night in His presence.\nWe’ll see you tomorrow.', 'countdown_1', 50),
  ('event_day', 'Tonight', '🔥 Tonight 🔥\nDinner: 6:30pm\nProgram starts: 7:30pm\n\nWe’ll see you tonight at INGREIGN.', 'date_only', 60)
) as preset(preset_key, label, caption, generator_mode, position)
where workspace.slug = 'trushot-media'
on conflict (workspace_id, preset_key) do nothing;
