-- Rich flight itinerary details and dedicated three-hour push briefings.

alter table public."website-flight-events"
  add column if not exists departure_terminal text,
  add column if not exists arrival_terminal text,
  add column if not exists travel_class text,
  add column if not exists seat_number text;

alter table public."website-flight-events"
  drop constraint if exists "website-flight-events-travel-details-check";

alter table public."website-flight-events"
  add constraint "website-flight-events-travel-details-check"
  check (
    (departure_terminal is null or char_length(departure_terminal) <= 80)
    and (arrival_terminal is null or char_length(arrival_terminal) <= 80)
    and (travel_class is null or char_length(travel_class) <= 80)
    and (seat_number is null or char_length(seat_number) <= 40)
  );

alter table public."website-calendar-reminder-settings"
  add column if not exists notify_flights boolean not null default true,
  add column if not exists flight_lead_minutes integer not null default 180;

alter table public."website-calendar-reminder-settings"
  drop constraint if exists "website-calendar-reminder-settings-flight-lead-check";

alter table public."website-calendar-reminder-settings"
  add constraint "website-calendar-reminder-settings-flight-lead-check"
  check (flight_lead_minutes between 15 and 10080);

alter table public."website-calendar-reminder-deliveries"
  drop constraint if exists "website-calendar-reminder-deliveries-event-check";

alter table public."website-calendar-reminder-deliveries"
  add constraint "website-calendar-reminder-deliveries-event-check"
  check (event_kind in (
    'job_start',
    'job_due',
    'task_due',
    'campaign_start',
    'campaign_due',
    'calendar_event_start',
    'flight_departure',
    'flight_arrival'
  ));
