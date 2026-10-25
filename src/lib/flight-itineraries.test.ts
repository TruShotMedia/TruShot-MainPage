import { describe, expect, it } from "vitest";
import { buildFlightCalendarItineraries } from "@/lib/flight-itineraries";
import type { CalendarFlightEvent } from "@/lib/types";

function leg(overrides: Partial<CalendarFlightEvent>): CalendarFlightEvent {
  return {
    id: "leg-1",
    entity_type: "flight-event",
    client_id: "client-1",
    client_name: "Autopacific Group",
    travel_plan_id: "plan-1",
    leg_order: 1,
    leg_kind: "outbound",
    title: "Melbourne production trip",
    departure_date: "2026-11-02",
    departure_time: "08:00",
    arrival_date: "2026-11-02",
    arrival_time: "10:20",
    origin_location: "Brisbane · BNE",
    destination_location: "Melbourne · MEL",
    departure_airline: "Qantas",
    arrival_airline: "Qantas",
    departure_airline_code: "QF",
    arrival_airline_code: "QF",
    departure_flight_number: "QF 611",
    arrival_flight_number: "QF 611",
    departure_terminal: "Domestic",
    arrival_terminal: "T1",
    travel_class: "Economy",
    seat_number: "14A",
    notes: null,
    accommodation_title: null,
    accommodation_location: null,
    accommodation_notes: null,
    vehicle_title: null,
    vehicle_location: null,
    vehicle_notes: null,
    color: "#3975ad",
    created_at: "2026-10-25T00:00:00.000Z",
    updated_at: "2026-10-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildFlightCalendarItineraries", () => {
  it("renders linked outbound and return legs as one continuous calendar range", () => {
    const items = buildFlightCalendarItineraries([
      leg({ id: "return", leg_order: 2, leg_kind: "return", departure_date: "2026-11-06", departure_time: "17:30", arrival_date: "2026-11-06", arrival_time: "19:40", origin_location: "Melbourne · MEL", destination_location: "Brisbane · BNE", departure_airline: "Virgin Australia", arrival_airline: "Virgin Australia", departure_airline_code: "VA", arrival_airline_code: "VA" }),
      leg({ id: "outbound" }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "outbound",
      departure_date: "2026-11-02",
      arrival_date: "2026-11-06",
      origin_location: "Brisbane · BNE",
      destination_location: "Brisbane · BNE",
    });
    expect(items[0].itinerary_legs?.map((item) => item.id)).toEqual(["outbound", "return"]);
  });

  it("keeps legacy standalone flights separate", () => {
    const items = buildFlightCalendarItineraries([leg({ id: "legacy", travel_plan_id: null })]);
    expect(items).toHaveLength(1);
    expect(items[0].itinerary_legs).toBeUndefined();
  });
});
