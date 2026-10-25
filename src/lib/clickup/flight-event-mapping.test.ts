import { describe, expect, it } from "vitest";
import {
  buildClickUpFlightEventDescription,
  buildClickUpFlightEventPayload,
  extractClickUpFlightEventId,
  isClickUpFlightEventComplete,
  type ClickUpFlightEventSnapshot,
} from "@/lib/clickup/flight-event-mapping";

const flight: ClickUpFlightEventSnapshot = {
  id: "11111111-2222-4333-8444-555555555555",
  leg_kind: "outbound",
  leg_order: 1,
  title: "Sydney campaign shoot",
  departure_date: "2026-10-23",
  departure_time: "09:00:00",
  arrival_date: "2026-10-23",
  arrival_time: "10:30:00",
  origin_location: "Brisbane · BNE",
  destination_location: "Sydney · SYD",
  departure_airline: "Qantas",
  arrival_airline: "Qantas",
  departure_flight_number: "QF 501",
  arrival_flight_number: "QF 501",
  departure_terminal: "Domestic",
  arrival_terminal: "Terminal 3",
  travel_class: "Economy",
  seat_number: "14A",
  notes: "Carry-on camera kit.",
  accommodation_title: "Harbour Hotel",
  accommodation_location: "Sydney CBD",
  accommodation_notes: "Check-in after 2 pm.",
  vehicle_title: "Hire car",
  vehicle_location: "Terminal pickup",
  vehicle_notes: "Booking APG-12.",
};

describe("ClickUp flight event mapping", () => {
  it("keeps a flight open until its arrival time", () => {
    expect(isClickUpFlightEventComplete(flight, new Date("2026-10-23T00:29:00.000Z"))).toBe(false);
    expect(isClickUpFlightEventComplete(flight, new Date("2026-10-23T00:30:00.000Z"))).toBe(true);
  });

  it("prefixes the ClickUp task and includes the complete itinerary", () => {
    const payload = buildClickUpFlightEventPayload({
      assignedUserId: 42,
      completeStatus: "COMPLETE",
      flight,
      now: new Date("2026-10-22T23:00:00.000Z"),
      openStatus: "TO DO",
    });
    expect(payload).toMatchObject({
      name: `JOHN FLIGHT · ${flight.title} · Outbound`,
      status: "TO DO",
      assignees: [42],
      start_date_time: true,
      due_date_time: true,
    });
    expect(payload.start_date).toBe(Date.parse("2026-10-23T09:00:00+10:00"));
    expect(payload.due_date).toBe(Date.parse("2026-10-23T10:30:00+10:00"));
    const description = buildClickUpFlightEventDescription(flight);
    expect(description).toContain("AutoPacific flight itinerary");
    expect(description).toContain("**Plan leg:** Outbound");
    expect(description).toContain("QF 501");
    expect(description).toContain("Terminal 3");
    expect(description).toContain("**Seat:** 14A");
    expect(description).toContain("Synced from John's CRM");
    expect(extractClickUpFlightEventId(description)).toBe(flight.id);
  });
});
