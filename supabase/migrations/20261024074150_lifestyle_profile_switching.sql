-- Separate the shared Lifestyle sign-in into two independent in-app profiles.
-- Existing Lifestyle history belongs to John; Izzy begins with a clean plan.

alter table public."website-lifestyle-profiles"
  add column if not exists profile_key text not null default 'john';

update public."website-lifestyle-profiles"
set profile_key = 'john', display_name = 'John'
where profile_key = 'john';

alter table public."website-lifestyle-profiles"
  drop constraint if exists "website-lifestyle-profiles-user-key";

alter table public."website-lifestyle-profiles"
  add constraint "website-lifestyle-profiles-user-profile-key" unique (user_id, profile_key),
  add constraint "website-lifestyle-profiles-profile-key-check" check (profile_key in ('john', 'izzy'));

insert into public."website-lifestyle-profiles" (
  workspace_id,
  user_id,
  profile_key,
  display_name,
  height_cm,
  weight_kg
)
select
  workspace_id,
  user_id,
  'izzy',
  'Izzy',
  null,
  null
from public."website-lifestyle-profiles"
where profile_key = 'john'
on conflict (user_id, profile_key) do nothing;

alter table public."website-lifestyle-workout-sessions"
  add column if not exists profile_id uuid references public."website-lifestyle-profiles" (id) on delete cascade;
alter table public."website-lifestyle-session-exercises"
  add column if not exists profile_id uuid references public."website-lifestyle-profiles" (id) on delete cascade;
alter table public."website-lifestyle-checkins"
  add column if not exists profile_id uuid references public."website-lifestyle-profiles" (id) on delete cascade;
alter table public."website-lifestyle-push-subscriptions"
  add column if not exists profile_id uuid references public."website-lifestyle-profiles" (id) on delete cascade;
alter table public."website-lifestyle-wellness-reminder-deliveries"
  add column if not exists profile_id uuid references public."website-lifestyle-profiles" (id) on delete cascade;

update public."website-lifestyle-workout-sessions" as session
set profile_id = profile.id
from public."website-lifestyle-profiles" as profile
where profile.user_id = session.user_id
  and profile.profile_key = 'john'
  and session.profile_id is null;

update public."website-lifestyle-session-exercises" as exercise
set profile_id = session.profile_id
from public."website-lifestyle-workout-sessions" as session
where session.id = exercise.session_id
  and exercise.profile_id is null;

update public."website-lifestyle-checkins" as checkin
set profile_id = profile.id
from public."website-lifestyle-profiles" as profile
where profile.user_id = checkin.user_id
  and profile.profile_key = 'john'
  and checkin.profile_id is null;

update public."website-lifestyle-push-subscriptions" as subscription
set profile_id = profile.id
from public."website-lifestyle-profiles" as profile
where profile.user_id = subscription.user_id
  and profile.profile_key = 'john'
  and subscription.profile_id is null;

update public."website-lifestyle-wellness-reminder-deliveries" as delivery
set profile_id = profile.id
from public."website-lifestyle-profiles" as profile
where profile.user_id = delivery.user_id
  and profile.profile_key = 'john'
  and delivery.profile_id is null;

alter table public."website-lifestyle-workout-sessions"
  alter column profile_id set not null;
alter table public."website-lifestyle-session-exercises"
  alter column profile_id set not null;
alter table public."website-lifestyle-checkins"
  alter column profile_id set not null;
alter table public."website-lifestyle-push-subscriptions"
  alter column profile_id set not null;
alter table public."website-lifestyle-wellness-reminder-deliveries"
  alter column profile_id set not null;

alter table public."website-lifestyle-workout-sessions"
  drop constraint if exists "website-lifestyle-workout-user-date-key";
alter table public."website-lifestyle-workout-sessions"
  add constraint "website-lifestyle-workout-profile-date-key" unique (profile_id, session_date);

alter table public."website-lifestyle-checkins"
  drop constraint if exists "website-lifestyle-checkins-user-date-key";
alter table public."website-lifestyle-checkins"
  add constraint "website-lifestyle-checkins-profile-date-key" unique (profile_id, checkin_date);

do $$
declare
  endpoint_constraint text;
begin
  select constraint_name
  into endpoint_constraint
  from information_schema.constraint_column_usage
  where table_schema = 'public'
    and table_name = 'website-lifestyle-push-subscriptions'
    and column_name = 'endpoint'
    and constraint_name <> 'website-lifestyle-push-profile-endpoint-key'
  limit 1;

  if endpoint_constraint is not null then
    execute format('alter table public."website-lifestyle-push-subscriptions" drop constraint %I', endpoint_constraint);
  end if;
end
$$;

alter table public."website-lifestyle-push-subscriptions"
  add constraint "website-lifestyle-push-profile-endpoint-key" unique (profile_id, endpoint);

alter table public."website-lifestyle-wellness-reminder-deliveries"
  drop constraint if exists "website-lifestyle-wellness-reminders-dedupe-key";
alter table public."website-lifestyle-wellness-reminder-deliveries"
  add constraint "website-lifestyle-wellness-reminders-profile-dedupe-key" unique (profile_id, reminder_date, reminder_slot);

create index if not exists "website-lifestyle-workout-profile-date-idx"
  on public."website-lifestyle-workout-sessions" (profile_id, session_date);
create index if not exists "website-lifestyle-exercises-profile-idx"
  on public."website-lifestyle-session-exercises" (profile_id);
create index if not exists "website-lifestyle-checkins-profile-date-idx"
  on public."website-lifestyle-checkins" (profile_id, checkin_date desc);
create index if not exists "website-lifestyle-push-profile-idx"
  on public."website-lifestyle-push-subscriptions" (profile_id);
create index if not exists "website-lifestyle-wellness-reminders-profile-idx"
  on public."website-lifestyle-wellness-reminder-deliveries" (profile_id, scheduled_for desc);
