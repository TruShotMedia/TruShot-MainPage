-- Link flight legs into one editable travel plan. Existing one-way flight
-- events remain valid: they simply have a null travel_plan_id.

create table public."website-flight-plans" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid,
  title text not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-flight-plans-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-flight-plans-client-fkey"
    foreign key (client_id) references public."website-clients" (id) on delete set null,
  constraint "website-flight-plans-created-by-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-flight-plans-updated-by-fkey"
    foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-flight-plans-title-check"
    check (char_length(btrim(title)) between 2 and 180)
);

create index "website-flight-plans-workspace-client-idx"
  on public."website-flight-plans" (workspace_id, client_id, updated_at desc);

create trigger "website-flight-plans-updated-at"
before update on public."website-flight-plans"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-flight-plans" enable row level security;

create policy "website-flight-plans-member-select"
on public."website-flight-plans"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-flight-plans-member-insert"
on public."website-flight-plans"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-flight-plans-member-update"
on public."website-flight-plans"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-flight-plans-member-delete"
on public."website-flight-plans"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-flight-plans" from anon, authenticated, service_role;
grant select, insert, update, delete on public."website-flight-plans" to authenticated;
grant select on public."website-flight-plans" to service_role;

alter table public."website-flight-events"
  add column if not exists travel_plan_id uuid,
  add column if not exists leg_order integer not null default 1,
  add column if not exists leg_kind text not null default 'outbound',
  add column if not exists departure_airline_code text,
  add column if not exists arrival_airline_code text;

alter table public."website-flight-events"
  drop constraint if exists "website-flight-events-travel-plan-fkey",
  add constraint "website-flight-events-travel-plan-fkey"
    foreign key (travel_plan_id) references public."website-flight-plans" (id) on delete cascade,
  drop constraint if exists "website-flight-events-leg-order-check",
  add constraint "website-flight-events-leg-order-check"
    check (leg_order between 1 and 20),
  drop constraint if exists "website-flight-events-leg-kind-check",
  add constraint "website-flight-events-leg-kind-check"
    check (leg_kind in ('outbound', 'return', 'connection')),
  drop constraint if exists "website-flight-events-airline-code-check",
  add constraint "website-flight-events-airline-code-check"
    check (
      (departure_airline_code is null or departure_airline_code ~ '^[A-Z0-9]{2,3}$')
      and (arrival_airline_code is null or arrival_airline_code ~ '^[A-Z0-9]{2,3}$')
    );

create index "website-flight-events-plan-order-idx"
  on public."website-flight-events" (travel_plan_id, leg_order, departure_date, departure_time)
  where travel_plan_id is not null;

comment on table public."website-flight-plans" is
  'One logical journey containing one or more outbound, return, or connection flight legs.';
comment on column public."website-flight-events".travel_plan_id is
  'Optional parent itinerary. Null preserves pre-existing standalone flight events.';
comment on column public."website-flight-events".leg_kind is
  'Visual itinerary role: outbound, return, or connection.';
