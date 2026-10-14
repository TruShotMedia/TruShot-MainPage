-- Structured flight itineraries for the authenticated tablet calendars.
-- Every exposed object retains the required website- prefix.

create table public."website-flight-events" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  title text not null,
  departure_date date not null,
  departure_time time without time zone not null,
  arrival_date date not null,
  arrival_time time without time zone not null,
  origin_location text not null,
  destination_location text not null,
  departure_airline text not null,
  arrival_airline text not null,
  departure_flight_number text,
  arrival_flight_number text,
  notes text,
  accommodation_title text,
  accommodation_location text,
  accommodation_notes text,
  vehicle_title text,
  vehicle_location text,
  vehicle_notes text,
  color text not null default '#3975ad',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-flight-events-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-flight-events-created-by-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-flight-events-updated-by-fkey"
    foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-flight-events-title-check"
    check (char_length(btrim(title)) between 2 and 180),
  constraint "website-flight-events-locations-check"
    check (
      char_length(btrim(origin_location)) between 2 and 180
      and char_length(btrim(destination_location)) between 2 and 180
    ),
  constraint "website-flight-events-airlines-check"
    check (
      char_length(btrim(departure_airline)) between 2 and 120
      and char_length(btrim(arrival_airline)) between 2 and 120
    ),
  constraint "website-flight-events-flight-numbers-check"
    check (
      (departure_flight_number is null or char_length(departure_flight_number) <= 40)
      and (arrival_flight_number is null or char_length(arrival_flight_number) <= 40)
    ),
  constraint "website-flight-events-notes-check"
    check (
      (notes is null or char_length(notes) <= 4000)
      and (accommodation_notes is null or char_length(accommodation_notes) <= 2000)
      and (vehicle_notes is null or char_length(vehicle_notes) <= 2000)
    ),
  constraint "website-flight-events-optionals-check"
    check (
      (accommodation_title is null or char_length(accommodation_title) <= 180)
      and (accommodation_location is null or char_length(accommodation_location) <= 300)
      and (vehicle_title is null or char_length(vehicle_title) <= 180)
      and (vehicle_location is null or char_length(vehicle_location) <= 300)
    ),
  constraint "website-flight-events-color-check"
    check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint "website-flight-events-window-check"
    check (
      (arrival_date + arrival_time) > (departure_date + departure_time)
    )
);

create index "website-flight-events-workspace-window-idx"
  on public."website-flight-events" (workspace_id, departure_date, arrival_date);

create index "website-flight-events-created-by-idx"
  on public."website-flight-events" (created_by)
  where created_by is not null;

create index "website-flight-events-updated-by-idx"
  on public."website-flight-events" (updated_by)
  where updated_by is not null;

create trigger "website-flight-events-updated-at"
before update on public."website-flight-events"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-flight-events" enable row level security;

create policy "website-flight-events-member-select"
on public."website-flight-events"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-flight-events-member-insert"
on public."website-flight-events"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-flight-events-member-update"
on public."website-flight-events"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-flight-events-member-delete"
on public."website-flight-events"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-flight-events" from anon, authenticated, service_role;
grant select, insert, update, delete on public."website-flight-events" to authenticated;
grant select on public."website-flight-events" to service_role;
