-- Replace the historic free-text airline variants with the canonical carrier
-- names/codes used by the flight editor. Unknown names intentionally remain
-- untouched, so no travel record is ever guessed or discarded.
with airline_map (legacy_name, airline_name, airline_code) as (
  values
    ('virgin au', 'Virgin Australia', 'VA'),
    ('virgin australia', 'Virgin Australia', 'VA'),
    ('virgin australia airlines', 'Virgin Australia', 'VA'),
    ('qantas', 'Qantas', 'QF'),
    ('qantas airways', 'Qantas', 'QF'),
    ('qantas airlines', 'Qantas', 'QF')
),
normalised as (
  select
    flights.id,
    departure.airline_name as departure_airline_name,
    departure.airline_code as departure_airline_code,
    arrival.airline_name as arrival_airline_name,
    arrival.airline_code as arrival_airline_code
  from public."website-flight-events" as flights
  left join airline_map as departure
    on regexp_replace(lower(trim(coalesce(flights.departure_airline, ''))), '[^a-z0-9]+', ' ', 'g') = departure.legacy_name
  left join airline_map as arrival
    on regexp_replace(lower(trim(coalesce(flights.arrival_airline, ''))), '[^a-z0-9]+', ' ', 'g') = arrival.legacy_name
)
update public."website-flight-events" as flights
set
  departure_airline = coalesce(normalised.departure_airline_name, flights.departure_airline),
  departure_airline_code = coalesce(normalised.departure_airline_code, flights.departure_airline_code),
  arrival_airline = coalesce(normalised.arrival_airline_name, flights.arrival_airline),
  arrival_airline_code = coalesce(normalised.arrival_airline_code, flights.arrival_airline_code),
  updated_at = now()
from normalised
where flights.id = normalised.id
  and (
    normalised.departure_airline_code is not null
    or normalised.arrival_airline_code is not null
  );
