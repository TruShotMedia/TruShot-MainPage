"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scheduleClickUpFlightEventSync } from "@/lib/clickup/flight-event-sync";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getProductionContext } from "@/lib/data/admin";
import { findAirline } from "@/lib/airlines";
import type { CalendarFlightEvent, FlightEventDeleteResult, FlightEventSaveResult } from "@/lib/types";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalText = (maximum: number) => z.string().trim().max(maximum);
const optionalAirlineCode = z.string().trim().toUpperCase().refine((value) => !value || /^[A-Z0-9]{2,3}$/.test(value));

const planSchema = z.object({
  client_id: z.union([z.string().uuid(), z.literal("")]).default(""),
  title: z.string().trim().min(2).max(180),
  notes: optionalText(4_000),
  accommodation_title: optionalText(180),
  accommodation_location: optionalText(300),
  accommodation_notes: optionalText(2_000),
  vehicle_title: optionalText(180),
  vehicle_location: optionalText(300),
  vehicle_notes: optionalText(2_000),
});

const legSchema = z.object({
  departure_date: dateSchema,
  departure_time: timeSchema,
  arrival_date: dateSchema,
  arrival_time: timeSchema,
  origin_location: z.string().trim().min(2).max(180),
  destination_location: z.string().trim().min(2).max(180),
  airline: z.string().trim().min(2).max(120),
  airline_code: optionalAirlineCode,
  flight_number: optionalText(40),
  departure_terminal: optionalText(80),
  arrival_terminal: optionalText(80),
  travel_class: optionalText(80),
  seat_number: optionalText(40),
});

const flightEventFields = "id,client_id,travel_plan_id,leg_order,leg_kind,title,departure_date,departure_time,arrival_date,arrival_time,origin_location,destination_location,departure_airline,arrival_airline,departure_airline_code,arrival_airline_code,departure_flight_number,arrival_flight_number,departure_terminal,arrival_terminal,travel_class,seat_number,notes,accommodation_title,accommodation_location,accommodation_notes,vehicle_title,vehicle_location,vehicle_notes,color,created_at,updated_at";

type ParsedLeg = z.infer<typeof legSchema>;
type ParsedPlan = z.infer<typeof planSchema>;

function nullable(value: string) {
  return value || null;
}

function readString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function parseLeg(formData: FormData, prefix: "outbound" | "return") {
  // The dropdown's IATA code is the single source of truth. Deriving the
  // display name here keeps persisted names, codes, and logos in step.
  const selectedAirline = findAirline(readString(formData, `${prefix}_airline_code`));
  const parsed = legSchema.safeParse({
    departure_date: readString(formData, `${prefix}_departure_date`),
    departure_time: readString(formData, `${prefix}_departure_time`),
    arrival_date: readString(formData, `${prefix}_arrival_date`),
    arrival_time: readString(formData, `${prefix}_arrival_time`),
    origin_location: readString(formData, `${prefix}_origin_location`),
    destination_location: readString(formData, `${prefix}_destination_location`),
    airline: selectedAirline?.name ?? "",
    airline_code: selectedAirline?.code ?? "",
    flight_number: readString(formData, `${prefix}_flight_number`),
    departure_terminal: readString(formData, `${prefix}_departure_terminal`),
    arrival_terminal: readString(formData, `${prefix}_arrival_terminal`),
    travel_class: readString(formData, `${prefix}_travel_class`),
    seat_number: readString(formData, `${prefix}_seat_number`),
  });
  if (!parsed.success || `${parsed.data.arrival_date}T${parsed.data.arrival_time}` <= `${parsed.data.departure_date}T${parsed.data.departure_time}`) {
    return { ok: false as const };
  }
  return { ok: true as const, data: parsed.data };
}

function parseFlightPlan(formData: FormData) {
  const plan = planSchema.safeParse({
    client_id: readString(formData, "client_id"),
    title: readString(formData, "title"),
    notes: readString(formData, "notes"),
    accommodation_title: readString(formData, "accommodation_title"),
    accommodation_location: readString(formData, "accommodation_location"),
    accommodation_notes: readString(formData, "accommodation_notes"),
    vehicle_title: readString(formData, "vehicle_title"),
    vehicle_location: readString(formData, "vehicle_location"),
    vehicle_notes: readString(formData, "vehicle_notes"),
  });
  const outbound = parseLeg(formData, "outbound");
  const includesReturn = readString(formData, "return_enabled") === "true";
  const returnLeg = includesReturn ? parseLeg(formData, "return") : null;
  if (!plan.success || !outbound.ok || (includesReturn && (!returnLeg || !returnLeg.ok))) {
    return { ok: false as const, error: "Check the trip title, route, airline, dates and times, then try again." };
  }
  if (returnLeg?.ok && `${returnLeg.data.departure_date}T${returnLeg.data.departure_time}` < `${outbound.data.arrival_date}T${outbound.data.arrival_time}`) {
    return { ok: false as const, error: "The return flight must leave after the outbound flight arrives." };
  }
  return { ok: true as const, plan: plan.data, legs: [outbound.data, ...(returnLeg?.ok ? [returnLeg.data] : [])] };
}

function planValues(plan: ParsedPlan, userId: string) {
  return { client_id: nullable(plan.client_id), title: plan.title, updated_by: userId };
}

function legValues({ leg, plan, planId, index, userId }: { leg: ParsedLeg; plan: ParsedPlan; planId: string; index: number; userId: string }) {
  const airlineCode = nullable(leg.airline_code);
  return {
    client_id: nullable(plan.client_id), travel_plan_id: planId, leg_order: index + 1, leg_kind: index === 0 ? "outbound" : "return", title: plan.title,
    departure_date: leg.departure_date, departure_time: leg.departure_time, arrival_date: leg.arrival_date, arrival_time: leg.arrival_time,
    origin_location: leg.origin_location, destination_location: leg.destination_location,
    departure_airline: leg.airline, arrival_airline: leg.airline, departure_airline_code: airlineCode, arrival_airline_code: airlineCode,
    departure_flight_number: nullable(leg.flight_number), arrival_flight_number: nullable(leg.flight_number),
    departure_terminal: nullable(leg.departure_terminal), arrival_terminal: nullable(leg.arrival_terminal),
    travel_class: nullable(leg.travel_class), seat_number: nullable(leg.seat_number), notes: nullable(plan.notes),
    accommodation_title: nullable(plan.accommodation_title), accommodation_location: nullable(plan.accommodation_location), accommodation_notes: nullable(plan.accommodation_notes),
    vehicle_title: nullable(plan.vehicle_title), vehicle_location: nullable(plan.vehicle_location), vehicle_notes: nullable(plan.vehicle_notes),
    color: "#3975ad", updated_by: userId,
  };
}

function revalidateFlightCalendars() {
  revalidatePath("/tablet");
  revalidatePath("/autopacific");
  revalidatePath("/autopacific/mobile");
}

function eventResult(data: Record<string, unknown>): FlightEventSaveResult {
  return { ok: true, event: { ...data, client_name: null, entity_type: "flight-event" } as CalendarFlightEvent };
}

export async function createFlightPlan(formData: FormData): Promise<FlightEventSaveResult> {
  const parsed = parseFlightPlan(formData);
  if (!parsed.ok) return parsed;
  const context = await getProductionContext();
  if (!context) return { ok: false, error: "Your admin session has expired. Sign in again and retry." };

  const { data: plan, error: planError } = await context.supabase
    .from("website-flight-plans")
    .insert({ ...planValues(parsed.plan, context.claims.sub), workspace_id: TRUSHOT_WORKSPACE_ID, created_by: context.claims.sub })
    .select("id").single();
  if (planError || !plan) return { ok: false, error: "The travel plan could not be created. Please try again." };

  const { data: legs, error: legsError } = await context.supabase
    .from("website-flight-events")
    .insert(parsed.legs.map((leg, index) => ({ ...legValues({ leg, plan: parsed.plan, planId: plan.id, index, userId: context.claims.sub }), workspace_id: TRUSHOT_WORKSPACE_ID, created_by: context.claims.sub })))
    .select(flightEventFields).order("leg_order");
  if (legsError || !legs?.length) {
    // Keep a failed create retry-safe: a plan without any legs is not useful.
    await context.supabase.from("website-flight-plans").delete().eq("id", plan.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
    return { ok: false, error: "The travel legs could not be created. Please try again." };
  }
  revalidateFlightCalendars();
  scheduleClickUpFlightEventSync();
  return eventResult(legs[0]);
}

export async function updateFlightPlan(formData: FormData): Promise<FlightEventSaveResult> {
  const parsed = parseFlightPlan(formData);
  if (!parsed.ok) return parsed;
  const planId = z.string().uuid().safeParse(formData.get("plan_id"));
  const sourceEventId = z.string().uuid().safeParse(formData.get("source_event_id"));
  if (!planId.success && !sourceEventId.success) return { ok: false, error: "That flight itinerary is no longer available." };
  const context = await getProductionContext();
  if (!context) return { ok: false, error: "Your admin session has expired. Sign in again and retry." };

  let resolvedPlanId = planId.success ? planId.data : null;
  let existingLegs: Array<{ id: string; leg_kind: string; leg_order: number }> = [];
  if (resolvedPlanId) {
    const { data: currentPlan, error: currentPlanError } = await context.supabase.from("website-flight-plans").select("id").eq("id", resolvedPlanId).eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle();
    if (currentPlanError || !currentPlan) return { ok: false, error: "That travel plan is no longer available." };
    const { data, error } = await context.supabase.from("website-flight-events").select("id,leg_kind,leg_order").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("travel_plan_id", resolvedPlanId).order("leg_order");
    if (error) return { ok: false, error: "The travel legs could not be loaded. Please try again." };
    existingLegs = data ?? [];
  } else {
    const { data: legacyEvent, error: legacyError } = await context.supabase.from("website-flight-events").select("id").eq("id", sourceEventId.data).eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("travel_plan_id", null).maybeSingle();
    if (legacyError || !legacyEvent) return { ok: false, error: "That standalone flight is no longer available." };
    const { data: createdPlan, error: createPlanError } = await context.supabase
      .from("website-flight-plans")
      .insert({ ...planValues(parsed.plan, context.claims.sub), workspace_id: TRUSHOT_WORKSPACE_ID, created_by: context.claims.sub })
      .select("id").single();
    if (createPlanError || !createdPlan) return { ok: false, error: "The travel plan could not be prepared. Please try again." };
    resolvedPlanId = createdPlan.id;
    existingLegs = [{ id: legacyEvent.id, leg_kind: "outbound", leg_order: 1 }];
  }

  const { error: planUpdateError } = await context.supabase.from("website-flight-plans").update(planValues(parsed.plan, context.claims.sub)).eq("id", resolvedPlanId).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  if (planUpdateError) return { ok: false, error: "The travel plan could not be updated. Please try again." };
  if (!resolvedPlanId) return { ok: false, error: "The travel plan could not be resolved. Please try again." };

  const usedIds = new Set<string>();
  const savedLegs: Record<string, unknown>[] = [];
  for (const [index, leg] of parsed.legs.entries()) {
    const kind = index === 0 ? "outbound" : "return";
    const existing = existingLegs.find((item) => item.leg_kind === kind) ?? existingLegs.find((item) => item.leg_order === index + 1);
    const values = legValues({ leg, plan: parsed.plan, planId: resolvedPlanId, index, userId: context.claims.sub });
    if (existing) {
      usedIds.add(existing.id);
      const { data, error } = await context.supabase.from("website-flight-events").update(values).eq("id", existing.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select(flightEventFields).single();
      if (error || !data) return { ok: false, error: "A travel leg could not be updated. Please try again." };
      savedLegs.push(data);
    } else {
      const { data, error } = await context.supabase.from("website-flight-events").insert({ ...values, workspace_id: TRUSHOT_WORKSPACE_ID, created_by: context.claims.sub }).select(flightEventFields).single();
      if (error || !data) return { ok: false, error: "A return travel leg could not be added. Please try again." };
      savedLegs.push(data);
    }
  }

  // The editor owns outbound and return legs. Keep any future connection legs
  // intact rather than deleting itinerary detail it does not expose yet.
  const staleIds = existingLegs
    .filter((item) => item.leg_kind !== "connection")
    .map((item) => item.id)
    .filter((id) => !usedIds.has(id));
  if (staleIds.length) {
    const { error } = await context.supabase.from("website-flight-events").delete().eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("id", staleIds);
    if (error) return { ok: false, error: "The removed return leg could not be deleted. Please try again." };
  }
  revalidateFlightCalendars();
  scheduleClickUpFlightEventSync();
  return eventResult(savedLegs[0]);
}

export async function deleteFlightPlan(formData: FormData): Promise<FlightEventDeleteResult> {
  const planId = z.string().uuid().safeParse(formData.get("plan_id"));
  const eventId = z.string().uuid().safeParse(formData.get("event_id"));
  if (!planId.success && !eventId.success) return { ok: false, error: "That flight itinerary is no longer available." };
  const context = await getProductionContext();
  if (!context) return { ok: false, error: "Your admin session has expired. Sign in again and retry." };
  const query = planId.success
    ? context.supabase.from("website-flight-plans").delete().eq("id", planId.data).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single()
    : context.supabase.from("website-flight-events").delete().eq("id", eventId.data).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single();
  const { data, error } = await query;
  if (error || !data) return { ok: false, error: "The flight itinerary could not be deleted. Please try again." };
  revalidateFlightCalendars();
  scheduleClickUpFlightEventSync();
  return { ok: true };
}
