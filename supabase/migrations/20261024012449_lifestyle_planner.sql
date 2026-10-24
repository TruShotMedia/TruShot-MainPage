-- Standalone Lifestyle strength planner, completion history and private push channel.

create table public."website-lifestyle-profiles" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces" (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default 'John',
  days_per_week integer not null default 3,
  session_duration_minutes integer not null default 60,
  preferred_start_time time not null default '17:30',
  preferred_days smallint[] not null default array[1, 3, 5]::smallint[],
  reminder_offsets_minutes integer[] not null default array[600, 120]::integer[],
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  training_goal text not null default 'strength_and_muscle',
  experience_level text not null default 'returning',
  focus_areas text[] not null default array['glutes', 'posterior_chain', 'full_body']::text[],
  safety_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-lifestyle-profiles-user-key" unique (user_id),
  constraint "website-lifestyle-profiles-days-check" check (days_per_week between 2 and 5),
  constraint "website-lifestyle-profiles-duration-check" check (session_duration_minutes between 30 and 120),
  constraint "website-lifestyle-profiles-days-array-check" check (cardinality(preferred_days) between 2 and 5),
  constraint "website-lifestyle-profiles-reminders-check" check (cardinality(reminder_offsets_minutes) between 0 and 4),
  constraint "website-lifestyle-profiles-height-check" check (height_cm is null or height_cm between 100 and 250),
  constraint "website-lifestyle-profiles-weight-check" check (weight_kg is null or weight_kg between 30 and 300),
  constraint "website-lifestyle-profiles-display-check" check (char_length(display_name) between 1 and 80),
  constraint "website-lifestyle-profiles-goal-check" check (training_goal in ('strength_and_muscle', 'general_fitness')),
  constraint "website-lifestyle-profiles-level-check" check (experience_level in ('beginner', 'returning', 'experienced'))
);

create table public."website-lifestyle-workout-sessions" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces" (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  workout_key text not null,
  title text not null,
  focus text not null,
  sequence_index integer not null,
  status text not null default 'scheduled',
  source text not null default 'auto',
  scheduling_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-lifestyle-workout-user-date-key" unique (user_id, session_date),
  constraint "website-lifestyle-workout-key-check" check (workout_key ~ '^[a-z0-9_-]{2,60}$'),
  constraint "website-lifestyle-workout-title-check" check (char_length(title) between 1 and 120),
  constraint "website-lifestyle-workout-focus-check" check (char_length(focus) between 1 and 220),
  constraint "website-lifestyle-workout-status-check" check (status in ('scheduled', 'completed', 'skipped')),
  constraint "website-lifestyle-workout-source-check" check (source in ('auto', 'manual')),
  constraint "website-lifestyle-workout-sequence-check" check (sequence_index >= 0),
  constraint "website-lifestyle-workout-note-check" check (scheduling_note is null or char_length(scheduling_note) <= 300)
);

create index "website-lifestyle-workout-user-date-idx"
  on public."website-lifestyle-workout-sessions" (user_id, session_date);
create index "website-lifestyle-workout-due-idx"
  on public."website-lifestyle-workout-sessions" (session_date, start_time)
  where status = 'scheduled';

create table public."website-lifestyle-session-exercises" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces" (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public."website-lifestyle-workout-sessions" (id) on delete cascade,
  exercise_key text not null,
  name text not null,
  movement_pattern text not null,
  position integer not null,
  target_sets integer not null,
  rep_min integer not null,
  rep_max integer not null,
  rest_seconds integer not null,
  form_cues text[] not null default '{}',
  completed boolean not null default false,
  completed_sets integer not null default 0,
  weight_kg numeric(6,2),
  reps_completed integer,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-lifestyle-session-exercise-key" unique (session_id, exercise_key),
  constraint "website-lifestyle-session-exercise-name-check" check (char_length(name) between 1 and 120),
  constraint "website-lifestyle-session-exercise-pattern-check" check (movement_pattern in ('squat', 'hinge', 'bridge', 'push', 'pull', 'carry', 'core', 'single_leg')),
  constraint "website-lifestyle-session-exercise-position-check" check (position between 0 and 20),
  constraint "website-lifestyle-session-exercise-sets-check" check (target_sets between 1 and 8 and completed_sets between 0 and 8),
  constraint "website-lifestyle-session-exercise-reps-check" check (rep_min between 1 and 60 and rep_max between rep_min and 120),
  constraint "website-lifestyle-session-exercise-rest-check" check (rest_seconds between 15 and 300),
  constraint "website-lifestyle-session-exercise-weight-check" check (weight_kg is null or weight_kg between 0 and 1000),
  constraint "website-lifestyle-session-exercise-completed-reps-check" check (reps_completed is null or reps_completed between 0 and 500),
  constraint "website-lifestyle-session-exercise-notes-check" check (notes is null or char_length(notes) <= 500)
);

create index "website-lifestyle-exercises-session-position-idx"
  on public."website-lifestyle-session-exercises" (session_id, position);
create index "website-lifestyle-exercises-user-idx"
  on public."website-lifestyle-session-exercises" (user_id);

create table public."website-lifestyle-checkins" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces" (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null,
  weight_kg numeric(5,1),
  energy integer,
  sleep_hours numeric(3,1),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-lifestyle-checkins-user-date-key" unique (user_id, checkin_date),
  constraint "website-lifestyle-checkins-weight-check" check (weight_kg is null or weight_kg between 30 and 300),
  constraint "website-lifestyle-checkins-energy-check" check (energy is null or energy between 1 and 5),
  constraint "website-lifestyle-checkins-sleep-check" check (sleep_hours is null or sleep_hours between 0 and 24),
  constraint "website-lifestyle-checkins-note-check" check (note is null or char_length(note) <= 1000)
);

create index "website-lifestyle-checkins-user-date-idx"
  on public."website-lifestyle-checkins" (user_id, checkin_date desc);

create table public."website-lifestyle-push-subscriptions" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces" (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  expiration_time bigint,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-lifestyle-push-endpoint-check" check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  constraint "website-lifestyle-push-p256dh-check" check (char_length(p256dh) between 20 and 255),
  constraint "website-lifestyle-push-auth-check" check (char_length(auth_key) between 10 and 255),
  constraint "website-lifestyle-push-agent-check" check (user_agent is null or char_length(user_agent) <= 500)
);

create index "website-lifestyle-push-user-idx"
  on public."website-lifestyle-push-subscriptions" (user_id);

create table public."website-lifestyle-reminder-deliveries" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces" (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public."website-lifestyle-workout-sessions" (id) on delete cascade,
  offset_minutes integer not null,
  reminder_at timestamptz not null,
  status text not null default 'processing',
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  constraint "website-lifestyle-reminders-dedupe-key" unique (session_id, offset_minutes),
  constraint "website-lifestyle-reminders-offset-check" check (offset_minutes between 0 and 10080),
  constraint "website-lifestyle-reminders-status-check" check (status in ('processing', 'sent', 'failed')),
  constraint "website-lifestyle-reminders-count-check" check (delivered_count >= 0 and failed_count >= 0),
  constraint "website-lifestyle-reminders-error-check" check (error_message is null or char_length(error_message) <= 1000)
);

create index "website-lifestyle-reminders-session-idx"
  on public."website-lifestyle-reminder-deliveries" (session_id);

alter table public."website-lifestyle-profiles" enable row level security;
alter table public."website-lifestyle-workout-sessions" enable row level security;
alter table public."website-lifestyle-session-exercises" enable row level security;
alter table public."website-lifestyle-checkins" enable row level security;
alter table public."website-lifestyle-push-subscriptions" enable row level security;
alter table public."website-lifestyle-reminder-deliveries" enable row level security;

create policy "website-lifestyle-profiles-own-all"
on public."website-lifestyle-profiles" for all to authenticated
using (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)))
with check (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-lifestyle-workouts-own-all"
on public."website-lifestyle-workout-sessions" for all to authenticated
using (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)))
with check (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-lifestyle-exercises-own-all"
on public."website-lifestyle-session-exercises" for all to authenticated
using (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)))
with check (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-lifestyle-checkins-own-all"
on public."website-lifestyle-checkins" for all to authenticated
using (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)))
with check (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-lifestyle-push-own-all"
on public."website-lifestyle-push-subscriptions" for all to authenticated
using (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)))
with check (user_id = (select auth.uid()) and (select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-lifestyle-profiles" from anon, authenticated, service_role;
revoke all on public."website-lifestyle-workout-sessions" from anon, authenticated, service_role;
revoke all on public."website-lifestyle-session-exercises" from anon, authenticated, service_role;
revoke all on public."website-lifestyle-checkins" from anon, authenticated, service_role;
revoke all on public."website-lifestyle-push-subscriptions" from anon, authenticated, service_role;
revoke all on public."website-lifestyle-reminder-deliveries" from anon, authenticated, service_role;
grant select, insert, update, delete on public."website-lifestyle-profiles" to authenticated;
grant select, insert, update, delete on public."website-lifestyle-workout-sessions" to authenticated;
grant select, insert, update, delete on public."website-lifestyle-session-exercises" to authenticated;
grant select, insert, update, delete on public."website-lifestyle-checkins" to authenticated;
grant select, insert, update, delete on public."website-lifestyle-push-subscriptions" to authenticated;
grant select, insert, update, delete on public."website-lifestyle-push-subscriptions" to service_role;
grant select, insert, update, delete on public."website-lifestyle-reminder-deliveries" to service_role;
grant select, update on public."website-lifestyle-workout-sessions" to service_role;
grant select on public."website-lifestyle-profiles" to service_role;

create trigger "website-lifestyle-profiles-updated-at"
before update on public."website-lifestyle-profiles"
for each row execute function "website-private"."website-set-updated-at"();
create trigger "website-lifestyle-workouts-updated-at"
before update on public."website-lifestyle-workout-sessions"
for each row execute function "website-private"."website-set-updated-at"();
create trigger "website-lifestyle-exercises-updated-at"
before update on public."website-lifestyle-session-exercises"
for each row execute function "website-private"."website-set-updated-at"();
create trigger "website-lifestyle-checkins-updated-at"
before update on public."website-lifestyle-checkins"
for each row execute function "website-private"."website-set-updated-at"();
create trigger "website-lifestyle-push-updated-at"
before update on public."website-lifestyle-push-subscriptions"
for each row execute function "website-private"."website-set-updated-at"();

insert into public."website-lifestyle-profiles" (
  workspace_id,
  user_id,
  display_name,
  height_cm,
  weight_kg
)
select
  admin_user.workspace_id,
  auth_user.id,
  coalesce(admin_user.display_name, 'John'),
  180,
  70
from auth.users auth_user
join public."website-admin-users" admin_user on admin_user.user_id = auth_user.id and admin_user.is_active
where lower(auth_user.email) = lower('info@fearlessau.com')
on conflict (user_id) do nothing;
