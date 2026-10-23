export type ClickUpFlightEventSnapshot = {
  id: string;
  title: string;
  departure_date: string;
  departure_time: string;
  arrival_date: string;
  arrival_time: string;
  origin_location: string;
  destination_location: string;
  departure_airline: string;
  arrival_airline: string;
  departure_flight_number: string | null;
  arrival_flight_number: string | null;
  departure_terminal: string | null;
  arrival_terminal: string | null;
  travel_class: string | null;
  seat_number: string | null;
  notes: string | null;
  accommodation_title: string | null;
  accommodation_location: string | null;
  accommodation_notes: string | null;
  vehicle_title: string | null;
  vehicle_location: string | null;
  vehicle_notes: string | null;
};

const flightEventMarker = /\[TRUSHOT_FLIGHT_EVENT_ID:([0-9a-f-]{36})\]/i;

function brisbaneTimestamp(date: string, time: string) {
  const timestamp = Date.parse(`${date}T${time.slice(0, 5)}:00+10:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function clean(value: string | null) {
  return value?.trim() || null;
}

function itineraryLine({
  airline,
  date,
  flightNumber,
  location,
  terminal,
  time,
}: {
  airline: string;
  date: string;
  flightNumber: string | null;
  location: string;
  terminal: string | null;
  time: string;
}) {
  return [
    `${airline}${clean(flightNumber) ? ` ${flightNumber?.trim()}` : ""}`,
    `${date} · ${time.slice(0, 5)}`,
    location,
    clean(terminal) ? `Terminal ${terminal?.trim()}` : null,
  ].filter(Boolean).join(" · ");
}

export function isClickUpFlightEventComplete(flight: ClickUpFlightEventSnapshot, now = new Date()) {
  const arrival = brisbaneTimestamp(flight.arrival_date, flight.arrival_time);
  return arrival !== null && now.getTime() >= arrival;
}

export function buildClickUpFlightEventDescription(flight: ClickUpFlightEventSnapshot) {
  const passengerDetails = [
    clean(flight.travel_class) ? `**Class:** ${flight.travel_class?.trim()}` : null,
    clean(flight.seat_number) ? `**Seat:** ${flight.seat_number?.trim()}` : null,
  ].filter(Boolean).join("  \n");
  const accommodation = clean(flight.accommodation_title)
    ? [
      `**Accommodation:** ${flight.accommodation_title?.trim()}`,
      clean(flight.accommodation_location) ? flight.accommodation_location?.trim() : null,
      clean(flight.accommodation_notes) ? flight.accommodation_notes?.trim() : null,
    ].filter(Boolean).join("  \n")
    : null;
  const vehicle = clean(flight.vehicle_title)
    ? [
      `**Vehicle:** ${flight.vehicle_title?.trim()}`,
      clean(flight.vehicle_location) ? flight.vehicle_location?.trim() : null,
      clean(flight.vehicle_notes) ? flight.vehicle_notes?.trim() : null,
    ].filter(Boolean).join("  \n")
    : null;

  return [
    [
      "**CRM type:** AutoPacific flight itinerary",
      `**Route:** ${flight.origin_location} → ${flight.destination_location}`,
      `**Departure:** ${itineraryLine({
        airline: flight.departure_airline,
        date: flight.departure_date,
        flightNumber: flight.departure_flight_number,
        location: flight.origin_location,
        terminal: flight.departure_terminal,
        time: flight.departure_time,
      })}`,
      `**Arrival:** ${itineraryLine({
        airline: flight.arrival_airline,
        date: flight.arrival_date,
        flightNumber: flight.arrival_flight_number,
        location: flight.destination_location,
        terminal: flight.arrival_terminal,
        time: flight.arrival_time,
      })}`,
      passengerDetails || null,
    ].filter(Boolean).join("  \n"),
    clean(flight.notes),
    accommodation,
    vehicle,
    `---\nSynced from John's CRM · Flight event ID: \`${flight.id}\`\n[TRUSHOT_FLIGHT_EVENT_ID:${flight.id}]`,
  ].filter(Boolean).join("\n\n");
}

export function extractClickUpFlightEventId(description: string | null | undefined) {
  return description?.match(flightEventMarker)?.[1]?.toLowerCase() ?? null;
}

export function buildClickUpFlightEventPayload({
  assignedUserId,
  completeStatus,
  flight,
  now,
  openStatus,
}: {
  assignedUserId: number;
  completeStatus: string;
  flight: ClickUpFlightEventSnapshot;
  now?: Date;
  openStatus: string;
}) {
  return {
    name: `JOHN FLIGHT · ${flight.title}`,
    markdown_content: buildClickUpFlightEventDescription(flight),
    status: isClickUpFlightEventComplete(flight, now) ? completeStatus : openStatus,
    archived: false,
    assignees: [assignedUserId],
    start_date: brisbaneTimestamp(flight.departure_date, flight.departure_time),
    start_date_time: true,
    due_date: brisbaneTimestamp(flight.arrival_date, flight.arrival_time),
    due_date_time: true,
  };
}

export function buildClickUpFlightEventUpdatePayload(
  input: Parameters<typeof buildClickUpFlightEventPayload>[0],
) {
  const payload = buildClickUpFlightEventPayload(input);
  return {
    ...payload,
    assignees: { add: [input.assignedUserId], rem: [] },
  };
}
