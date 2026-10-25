"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scheduleClickUpFlightEventSync } from "@/lib/clickup/flight-event-sync";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";
import type { FlightEventDeleteResult, FlightEventSaveResult } from "@/lib/types";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalText = (maximum: number) => z.string().trim().max(maximum);

const flightEventSchema = z.object({
  client_id: z.union([z.string().uuid(), z.literal("")]).default(""),
  title: z.string().trim().min(2).max(180),
  departure_date: dateSchema,
  departure_time: timeSchema,
  arrival_date: dateSchema,
  arrival_time: timeSchema,
  origin_location: z.string().trim().min(2).max(180),
  destination_location: z.string().trim().min(2).max(180),
  departure_airline: z.string().trim().min(2).max(120),
  arrival_airline: optionalText(120),
  departure_flight_number: optionalText(40),
  arrival_flight_number: optionalText(40),
  departure_terminal: optionalText(80),
  arrival_terminal: optionalText(80),
  travel_class: optionalText(80),
  seat_number: optionalText(40),
  notes: optionalText(4_000),
  accommodation_title: optionalText(180),
  accommodation_location: optionalText(300),
  accommodation_notes: optionalText(2_000),
  vehicle_title: optionalText(180),
  vehicle_location: optionalText(300),
  vehicle_notes: optionalText(2_000),
});

const flightEventFields = "id,client_id,title,departure_date,departure_time,arrival_date,arrival_time,origin_location,destination_location,departure_airline,arrival_airline,departure_flight_number,arrival_flight_number,departure_terminal,arrival_terminal,travel_class,seat_number,notes,accommodation_title,accommodation_location,accommodation_notes,vehicle_title,vehicle_location,vehicle_notes,color,created_at,updated_at";

function nullable(value: string) {
  return value || null;
}

function parseFlightEvent(formData: FormData) {
  const parsed = flightEventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: "Check the trip title, route, airline, dates and times, then try again." };
  }

  const input = parsed.data;
  if (`${input.arrival_date}T${input.arrival_time}` <= `${input.departure_date}T${input.departure_time}`) {
    return { ok: false as const, error: "Arrival must be after departure." };
  }

  const arrivalAirline = input.arrival_airline || input.departure_airline;
  return {
    ok: true as const,
    data: {
      client_id: nullable(input.client_id),
      title: input.title,
      departure_date: input.departure_date,
      departure_time: input.departure_time,
      arrival_date: input.arrival_date,
      arrival_time: input.arrival_time,
      origin_location: input.origin_location,
      destination_location: input.destination_location,
      departure_airline: input.departure_airline,
      arrival_airline: arrivalAirline,
      departure_flight_number: nullable(input.departure_flight_number),
      arrival_flight_number: nullable(input.arrival_flight_number),
      departure_terminal: nullable(input.departure_terminal),
      arrival_terminal: nullable(input.arrival_terminal),
      travel_class: nullable(input.travel_class),
      seat_number: nullable(input.seat_number),
      notes: nullable(input.notes),
      accommodation_title: nullable(input.accommodation_title),
      accommodation_location: nullable(input.accommodation_location),
      accommodation_notes: nullable(input.accommodation_notes),
      vehicle_title: nullable(input.vehicle_title),
      vehicle_location: nullable(input.vehicle_location),
      vehicle_notes: nullable(input.vehicle_notes),
      color: "#3975ad",
    },
  };
}

function revalidateFlightCalendars() {
  revalidatePath("/tablet");
  revalidatePath("/autopacific");
}

export async function createFlightEvent(formData: FormData): Promise<FlightEventSaveResult> {
  const parsed = parseFlightEvent(formData);
  if (!parsed.ok) return parsed;
  const context = await getAdminContext();
  if (!context) return { ok: false, error: "Your admin session has expired. Sign in again and retry." };

  const { data, error } = await context.supabase
    .from("website-flight-events")
    .insert({
      ...parsed.data,
      workspace_id: TRUSHOT_WORKSPACE_ID,
      created_by: context.claims.sub,
      updated_by: context.claims.sub,
    })
    .select(flightEventFields)
    .single();

  if (error || !data) return { ok: false, error: "The flight itinerary could not be created. Please try again." };
  revalidateFlightCalendars();
  scheduleClickUpFlightEventSync();
  return { ok: true, event: { ...data, client_name: null, entity_type: "flight-event" as const } };
}

export async function updateFlightEvent(formData: FormData): Promise<FlightEventSaveResult> {
  const parsedId = z.string().uuid().safeParse(formData.get("id"));
  if (!parsedId.success) return { ok: false, error: "That flight itinerary is no longer available." };
  const parsed = parseFlightEvent(formData);
  if (!parsed.ok) return parsed;
  const context = await getAdminContext();
  if (!context) return { ok: false, error: "Your admin session has expired. Sign in again and retry." };

  const { data, error } = await context.supabase
    .from("website-flight-events")
    .update({ ...parsed.data, updated_by: context.claims.sub })
    .eq("id", parsedId.data)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select(flightEventFields)
    .single();

  if (error || !data) return { ok: false, error: "The flight itinerary could not be updated. Please try again." };
  revalidateFlightCalendars();
  scheduleClickUpFlightEventSync();
  return { ok: true, event: { ...data, client_name: null, entity_type: "flight-event" as const } };
}

export async function deleteFlightEvent(formData: FormData): Promise<FlightEventDeleteResult> {
  const parsedId = z.string().uuid().safeParse(formData.get("id"));
  if (!parsedId.success) return { ok: false, error: "That flight itinerary is no longer available." };
  const context = await getAdminContext();
  if (!context) return { ok: false, error: "Your admin session has expired. Sign in again and retry." };

  const { data, error } = await context.supabase
    .from("website-flight-events")
    .delete()
    .eq("id", parsedId.data)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "The flight itinerary could not be deleted. Please try again." };
  revalidateFlightCalendars();
  scheduleClickUpFlightEventSync();
  return { ok: true };
}
