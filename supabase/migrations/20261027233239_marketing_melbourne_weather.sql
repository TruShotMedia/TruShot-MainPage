-- Allow a separate saved Melbourne forecast without changing Brisbane history or access policies.
alter table public."website-weather-snapshots"
  drop constraint "website-weather-snapshots_location_key_check",
  add constraint "website-weather-snapshots_location_key_check"
    check (location_key in ('brisbane-city', 'melbourne-city'));

comment on table public."website-weather-snapshots" is
  'Immutable MET Norway forecast snapshots for Brisbane City and Melbourne. Not historical observations.';
