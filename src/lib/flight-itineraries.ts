import type { CalendarFlightEvent } from "@/lib/types";

function sortLegs(left: CalendarFlightEvent, right: CalendarFlightEvent) {
  return left.leg_order - right.leg_order
    || left.departure_date.localeCompare(right.departure_date)
    || left.departure_time.localeCompare(right.departure_time);
}

/**
 * The database stores each flight leg independently so ClickUp and reminders
 * can act on exact departure/arrival times. The calendar displays linked legs
 * as one uninterrupted plan, from the first outbound departure to the final
 * return arrival.
 */
export function buildFlightCalendarItineraries(flights: CalendarFlightEvent[]) {
  const plans = new Map<string, CalendarFlightEvent[]>();
  const standalone: CalendarFlightEvent[] = [];

  for (const flight of flights) {
    if (!flight.travel_plan_id) {
      standalone.push(flight);
      continue;
    }
    plans.set(flight.travel_plan_id, [...(plans.get(flight.travel_plan_id) ?? []), flight]);
  }

  const linked = [...plans.values()].map((planLegs) => {
    const legs = [...planLegs].sort(sortLegs);
    const first = legs[0];
    const last = legs.at(-1)!;
    return {
      ...first,
      arrival_date: last.arrival_date,
      arrival_time: last.arrival_time,
      destination_location: last.destination_location,
      arrival_airline: last.arrival_airline,
      arrival_airline_code: last.arrival_airline_code,
      arrival_flight_number: last.arrival_flight_number,
      arrival_terminal: last.arrival_terminal,
      itinerary_legs: legs,
    };
  });

  return [...standalone, ...linked].sort((left, right) => (
    left.departure_date.localeCompare(right.departure_date)
    || left.departure_time.localeCompare(right.departure_time)
    || left.title.localeCompare(right.title)
  ));
}
