-- Immutable weekly Brisbane forecasts. These are predictions saved at capture
-- time, not observed weather; past days are never synthesized on first setup.
create table public."website-weather-snapshots" (
  workspace_id uuid not null references public."website-workspaces" (id) on delete cascade,
  location_key text not null check (location_key = 'brisbane-city'),
  week_start date not null check (extract(isodow from week_start) = 1),
  captured_at timestamptz not null,
  forecast_issued_at timestamptz not null,
  capture_kind text not null check (capture_kind in ('weekly', 'initial')),
  provider text not null check (provider = 'met-norway'),
  latitude numeric(7,4) not null,
  longitude numeric(7,4) not null,
  days jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) between 1 and 7),
  primary key (workspace_id, location_key, week_start)
);

alter table public."website-weather-snapshots" enable row level security;
create policy "website-weather-snapshots-workspace-select"
on public."website-weather-snapshots" for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-weather-snapshots" from anon, authenticated, service_role;
grant select on public."website-weather-snapshots" to authenticated;
grant select, insert on public."website-weather-snapshots" to service_role;
comment on table public."website-weather-snapshots" is 'Immutable MET Norway forecast snapshots for Brisbane City. Not historical observations.';

-- Brisbane is UTC+10 year-round. Sunday 06:17, with two safe retries; the
-- endpoint exits without a provider request once this week's snapshot exists.
select cron.schedule(
  'website-brisbane-weekly-weather',
  '17 20,21,22 * * 6',
  $job$
    select net.http_post(
      url := 'https://www.trushotmedia.com/api/cron/calendar-weather',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'website-calendar-reminders-cron-secret'), '')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 20000
    );
  $job$
);
