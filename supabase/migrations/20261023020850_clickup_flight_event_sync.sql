-- Mirror AutoPacific flight itineraries into ClickUp as distinct, CRM-owned
-- tasks. The durable outbox prevents a ClickUp outage from blocking calendar
-- edits, while the hidden marker prevents inbound reconciliation from
-- importing the mirrored task as a duplicate job.

alter table public."website-flight-events"
  add column client_id uuid,
  add constraint "website-flight-events-client-fkey"
    foreign key (client_id) references public."website-clients" (id) on delete set null;

-- Flight itineraries pre-date client scoping and were introduced for the
-- AutoPacific workspace. Preserve those existing records by attaching them to
-- the integration's configured client without hard-coding a generated ID.
update public."website-flight-events" flight
set client_id = integration.target_client_id
from public."website-clickup-integrations" integration
where flight.workspace_id = integration.workspace_id
  and flight.client_id is null;

create index "website-flight-events-client-date-idx"
  on public."website-flight-events" (client_id, arrival_date, departure_date)
  where client_id is not null;

create table public."website-clickup-flight-event-links" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  flight_event_id uuid not null,
  clickup_task_id text not null,
  clickup_task_url text,
  source_updated_at timestamptz,
  last_synced_at timestamptz,
  last_synced_status text,
  last_inbound_at timestamptz,
  sync_state text not null default 'linked',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-flight-event-links-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-flight-event-links-event-key"
    unique (workspace_id, flight_event_id),
  constraint "website-clickup-flight-event-links-task-key"
    unique (workspace_id, clickup_task_id),
  constraint "website-clickup-flight-event-links-sync-state-check"
    check (sync_state in ('linked', 'paused'))
);

create table public."website-clickup-flight-event-outbox" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  flight_event_id uuid not null,
  operation text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-flight-event-outbox-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-flight-event-outbox-operation-check"
    check (operation in ('upsert', 'archive', 'delete')),
  constraint "website-clickup-flight-event-outbox-status-check"
    check (status in ('pending', 'processing', 'retry', 'completed', 'failed')),
  constraint "website-clickup-flight-event-outbox-attempts-check"
    check (attempts between 0 and 100)
);

create index "website-clickup-flight-event-links-event-idx"
  on public."website-clickup-flight-event-links" (flight_event_id);

create index "website-clickup-flight-event-outbox-ready-idx"
  on public."website-clickup-flight-event-outbox" (workspace_id, status, available_at, created_at)
  where status in ('pending', 'retry');

create unique index "website-clickup-flight-event-outbox-active-event-key"
  on public."website-clickup-flight-event-outbox" (workspace_id, flight_event_id)
  where status in ('pending', 'retry');

create trigger "website-clickup-flight-event-links-updated-at"
before update on public."website-clickup-flight-event-links"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-clickup-flight-event-outbox-updated-at"
before update on public."website-clickup-flight-event-outbox"
for each row execute function "website-private"."website-set-updated-at"();

create or replace function "website-private"."website-queue-clickup-flight-event-sync"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration record;
  old_is_target boolean := false;
  new_is_target boolean := false;
  queued_operation text;
  queued_event_id uuid;
begin
  select item.target_client_id, item.enabled, item.deletion_mode
  into integration
  from public."website-clickup-integrations" item
  where item.workspace_id = case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;

  if not found or not integration.enabled then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    old_is_target := old.client_id = integration.target_client_id;
  end if;
  if tg_op <> 'DELETE' then
    new_is_target := new.client_id = integration.target_client_id;
  end if;

  if tg_op = 'INSERT' and new_is_target then
    queued_operation := 'upsert';
    queued_event_id := new.id;
  elsif tg_op = 'DELETE' and old_is_target then
    queued_operation := integration.deletion_mode;
    queued_event_id := old.id;
  elsif tg_op = 'UPDATE' then
    queued_event_id := new.id;
    if old_is_target and not new_is_target then
      queued_operation := integration.deletion_mode;
    elsif new_is_target and (
      not old_is_target
      or row(
        new.title, new.departure_date, new.departure_time,
        new.arrival_date, new.arrival_time,
        new.origin_location, new.destination_location,
        new.departure_airline, new.arrival_airline,
        new.departure_flight_number, new.arrival_flight_number,
        new.departure_terminal, new.arrival_terminal,
        new.travel_class, new.seat_number, new.notes,
        new.accommodation_title, new.accommodation_location, new.accommodation_notes,
        new.vehicle_title, new.vehicle_location, new.vehicle_notes,
        new.client_id
      ) is distinct from row(
        old.title, old.departure_date, old.departure_time,
        old.arrival_date, old.arrival_time,
        old.origin_location, old.destination_location,
        old.departure_airline, old.arrival_airline,
        old.departure_flight_number, old.arrival_flight_number,
        old.departure_terminal, old.arrival_terminal,
        old.travel_class, old.seat_number, old.notes,
        old.accommodation_title, old.accommodation_location, old.accommodation_notes,
        old.vehicle_title, old.vehicle_location, old.vehicle_notes,
        old.client_id
      )
    ) then
      queued_operation := 'upsert';
    end if;
  end if;

  if queued_operation is not null then
    insert into public."website-clickup-flight-event-outbox" (
      workspace_id,
      flight_event_id,
      operation
    ) values (
      case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end,
      queued_event_id,
      queued_operation
    )
    on conflict (workspace_id, flight_event_id) where status in ('pending', 'retry')
    do update set
      operation = excluded.operation,
      status = 'pending',
      attempts = 0,
      available_at = now(),
      processing_started_at = null,
      completed_at = null,
      last_error = null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function "website-private"."website-queue-clickup-flight-event-sync"()
  from public, anon, authenticated;

create trigger "website-flight-events-clickup-sync"
after insert or update or delete on public."website-flight-events"
for each row execute function "website-private"."website-queue-clickup-flight-event-sync"();

alter table public."website-clickup-flight-event-links" enable row level security;
alter table public."website-clickup-flight-event-outbox" enable row level security;

create policy "website-clickup-flight-event-links-admin-all"
on public."website-clickup-flight-event-links"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-clickup-flight-event-outbox-admin-all"
on public."website-clickup-flight-event-outbox"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

revoke all on public."website-clickup-flight-event-links" from anon, authenticated, service_role;
revoke all on public."website-clickup-flight-event-outbox" from anon, authenticated, service_role;

grant select, insert, update, delete on public."website-clickup-flight-event-links"
  to authenticated, service_role;
grant select, insert, update, delete on public."website-clickup-flight-event-outbox"
  to authenticated, service_role;

alter table public."website-clickup-sync-audit"
  add column flight_event_id uuid;

create index "website-clickup-sync-audit-flight-event-idx"
  on public."website-clickup-sync-audit" (flight_event_id)
  where flight_event_id is not null;

-- Queue the migrated itineraries immediately so enabling this deployment does
-- not require users to edit and resave each existing flight.
insert into public."website-clickup-flight-event-outbox" (
  workspace_id,
  flight_event_id,
  operation
)
select flight.workspace_id, flight.id, 'upsert'
from public."website-flight-events" flight
join public."website-clickup-integrations" integration
  on integration.workspace_id = flight.workspace_id
 and integration.target_client_id = flight.client_id
where integration.enabled
on conflict (workspace_id, flight_event_id) where status in ('pending', 'retry')
do nothing;

comment on column public."website-flight-events".client_id is
  'Optional client scope. AutoPacific-scoped flights are mirrored into the configured ClickUp Jobs List.';
comment on table public."website-clickup-flight-event-links" is
  'Stable mapping between AutoPacific flight itineraries and their ClickUp tasks.';
comment on table public."website-clickup-flight-event-outbox" is
  'Durable, retryable queue of CRM-to-ClickUp flight itinerary changes.';
