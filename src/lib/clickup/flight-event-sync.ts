import "server-only";

import { after } from "next/server";
import {
  buildClickUpFlightEventPayload,
  buildClickUpFlightEventUpdatePayload,
  isClickUpFlightEventComplete,
  type ClickUpFlightEventSnapshot,
} from "@/lib/clickup/flight-event-mapping";
import {
  ClickUpApiError,
  createClickUpTask,
  deleteClickUpTask,
  updateClickUpTask,
} from "@/lib/clickup/client";
import { getClickUpToken } from "@/lib/clickup/config";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

type FlightIntegration = {
  workspace_id: string;
  target_client_id: string;
  list_id: string;
  enabled: boolean;
  assigned_user_id: number | null;
  deletion_mode: "archive" | "delete";
  status_mapping: Record<string, string>;
};

type FlightOutboxItem = {
  id: string;
  workspace_id: string;
  flight_event_id: string;
  operation: "upsert" | "archive" | "delete";
  status: "pending" | "retry";
  attempts: number;
};

const CLICKUP_FLIGHT_MAPPING_VERSION = 2;

export type ClickUpFlightEventSyncResult = {
  status: "completed" | "disabled" | "not_configured" | "unavailable";
  processed: number;
  succeeded: number;
  failed: number;
  message: string;
};

const flightEventSelect = "id,title,departure_date,departure_time,arrival_date,arrival_time,origin_location,destination_location,departure_airline,arrival_airline,departure_flight_number,arrival_flight_number,departure_terminal,arrival_terminal,travel_class,seat_number,notes,accommodation_title,accommodation_location,accommodation_notes,vehicle_title,vehicle_location,vehicle_notes,client_id,updated_at" as const;

function safeMessage(error: unknown) {
  if (error instanceof ClickUpApiError) {
    if (error.status === 401) return "ClickUp rejected the API token.";
    if (error.status === 403) return "Your ClickUp profile cannot update AutoPacific flight itineraries.";
    if (error.status === 429) return "ClickUp is temporarily rate limiting flight syncing.";
  }
  return (error instanceof Error ? error.message : "The ClickUp flight sync failed.").slice(0, 500);
}

function retryDelaySeconds(attempts: number) {
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempts - 1)));
}

function flightStatuses(integration: FlightIntegration) {
  return {
    open: integration.status_mapping.planning ?? "TO DO",
    complete: integration.status_mapping.delivered ?? "COMPLETE",
  };
}

async function markFailure(supabase: ServiceClient, item: FlightOutboxItem, error: unknown) {
  const attempts = item.attempts + 1;
  const terminal = attempts >= 8;
  const message = safeMessage(error);
  await Promise.all([
    supabase.from("website-clickup-flight-event-outbox").update({
      status: terminal ? "failed" : "retry",
      attempts,
      available_at: new Date(Date.now() + retryDelaySeconds(attempts) * 1_000).toISOString(),
      processing_started_at: null,
      last_error: message,
    }).eq("id", item.id),
    supabase.from("website-clickup-flight-event-links").update({ last_error: message })
      .eq("workspace_id", item.workspace_id)
      .eq("flight_event_id", item.flight_event_id),
  ]);
  return message;
}

async function markComplete(supabase: ServiceClient, itemId: string) {
  await supabase.from("website-clickup-flight-event-outbox").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    processing_started_at: null,
    last_error: null,
  }).eq("id", itemId);
}

async function removeRemoteFlight({
  flightEventId,
  integration,
  operation,
  supabase,
}: {
  flightEventId: string;
  integration: FlightIntegration;
  operation: FlightOutboxItem["operation"];
  supabase: ServiceClient;
}) {
  const { data: link, error } = await supabase
    .from("website-clickup-flight-event-links")
    .select("id,clickup_task_id")
    .eq("workspace_id", integration.workspace_id)
    .eq("flight_event_id", flightEventId)
    .maybeSingle();
  if (error) throw error;
  if (!link) return;

  try {
    if (operation === "delete") await deleteClickUpTask(link.clickup_task_id);
    else await updateClickUpTask(link.clickup_task_id, { archived: true });
  } catch (error) {
    if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
  }
  await supabase.from("website-clickup-flight-event-links").delete().eq("id", link.id);
}

async function upsertRemoteFlight({
  flightEventId,
  integration,
  supabase,
}: {
  flightEventId: string;
  integration: FlightIntegration;
  supabase: ServiceClient;
}) {
  const { data: flight, error: flightError } = await supabase
    .from("website-flight-events")
    .select(flightEventSelect)
    .eq("workspace_id", integration.workspace_id)
    .eq("id", flightEventId)
    .maybeSingle();
  if (flightError) throw flightError;
  if (!flight || flight.client_id !== integration.target_client_id) {
    await removeRemoteFlight({ flightEventId, integration, operation: integration.deletion_mode, supabase });
    return;
  }
  if (!integration.assigned_user_id) throw new Error("The ClickUp assignee has not been connected.");

  const snapshot = flight as ClickUpFlightEventSnapshot;
  const statuses = flightStatuses(integration);
  const desiredStatus = isClickUpFlightEventComplete(snapshot) ? statuses.complete : statuses.open;
  const payloadInput = {
    assignedUserId: integration.assigned_user_id,
    completeStatus: statuses.complete,
    flight: snapshot,
    openStatus: statuses.open,
  };
  const { data: link, error: linkError } = await supabase
    .from("website-clickup-flight-event-links")
    .select("id,clickup_task_id")
    .eq("workspace_id", integration.workspace_id)
    .eq("flight_event_id", flight.id)
    .maybeSingle();
  if (linkError) throw linkError;

  let taskId = link?.clickup_task_id ?? null;
  let taskUrl: string | null = null;
  if (taskId) {
    try {
      const task = await updateClickUpTask(taskId, buildClickUpFlightEventUpdatePayload(payloadInput));
      taskUrl = task.url ?? `https://app.clickup.com/t/${taskId}`;
    } catch (error) {
      if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
      await supabase.from("website-clickup-flight-event-links").delete().eq("id", link?.id);
      taskId = null;
    }
  }
  if (!taskId) {
    const task = await createClickUpTask(integration.list_id, buildClickUpFlightEventPayload(payloadInput));
    taskId = task.id;
    taskUrl = task.url ?? `https://app.clickup.com/t/${task.id}`;
  }

  const now = new Date().toISOString();
  const { error: saveError } = await supabase.from("website-clickup-flight-event-links").upsert({
    workspace_id: integration.workspace_id,
    flight_event_id: flight.id,
    clickup_task_id: taskId,
    clickup_task_url: taskUrl,
    source_updated_at: flight.updated_at,
    last_synced_at: now,
    last_synced_status: desiredStatus,
    mapping_version: CLICKUP_FLIGHT_MAPPING_VERSION,
    sync_state: "linked",
    last_error: null,
  }, { onConflict: "workspace_id,flight_event_id" });
  if (saveError) throw saveError;
}

async function queueRequiredFlights(supabase: ServiceClient, integration: FlightIntegration) {
  const { data: flights, error: flightsError } = await supabase
    .from("website-flight-events")
    .select(flightEventSelect)
    .eq("workspace_id", integration.workspace_id)
    .eq("client_id", integration.target_client_id);
  if (flightsError) throw flightsError;
  if (!flights?.length) return 0;

  const flightIds = flights.map((flight) => flight.id);
  const [{ data: links, error: linksError }, { data: active, error: activeError }] = await Promise.all([
    supabase.from("website-clickup-flight-event-links")
      .select("flight_event_id,last_synced_status,source_updated_at,mapping_version")
      .eq("workspace_id", integration.workspace_id)
      .in("flight_event_id", flightIds),
    supabase.from("website-clickup-flight-event-outbox")
      .select("flight_event_id")
      .eq("workspace_id", integration.workspace_id)
      .in("status", ["pending", "retry", "processing"])
      .in("flight_event_id", flightIds),
  ]);
  if (linksError || activeError) throw linksError ?? activeError;
  const linksByFlight = new Map((links ?? []).map((link) => [link.flight_event_id, link]));
  const queuedIds = new Set((active ?? []).map((item) => item.flight_event_id));
  const statuses = flightStatuses(integration);
  const required = flights.filter((flight) => {
    if (queuedIds.has(flight.id)) return false;
    const link = linksByFlight.get(flight.id);
    if (!link) return true;
    if ((link.mapping_version ?? 1) < CLICKUP_FLIGHT_MAPPING_VERSION) return true;
    const snapshot = flight as ClickUpFlightEventSnapshot;
    const desiredStatus = isClickUpFlightEventComplete(snapshot) ? statuses.complete : statuses.open;
    return link.last_synced_status !== desiredStatus || link.source_updated_at !== flight.updated_at;
  });
  if (!required.length) return 0;
  const { error: queueError } = await supabase.from("website-clickup-flight-event-outbox").insert(
    required.map((flight) => ({
      workspace_id: integration.workspace_id,
      flight_event_id: flight.id,
      operation: "upsert",
      status: "pending",
      attempts: 0,
      available_at: new Date().toISOString(),
    })),
  );
  if (queueError) throw queueError;
  return required.length;
}

export async function dispatchClickUpFlightEventSync({ limit = 50 } = {}): Promise<ClickUpFlightEventSyncResult> {
  if (!getClickUpToken()) return { status: "not_configured", processed: 0, succeeded: 0, failed: 0, message: "ClickUp is awaiting its server token." };
  const supabase = createServiceClient();
  if (!supabase) return { status: "unavailable", processed: 0, succeeded: 0, failed: 0, message: "The server database connection is unavailable." };
  const { data: integrationData, error: integrationError } = await supabase
    .from("website-clickup-integrations")
    .select("workspace_id,target_client_id,list_id,enabled,assigned_user_id,deletion_mode,status_mapping")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .maybeSingle();
  if (integrationError) throw integrationError;
  const integration = integrationData as FlightIntegration | null;
  if (!integration?.enabled) return { status: "disabled", processed: 0, succeeded: 0, failed: 0, message: "ClickUp mirroring is paused." };

  const startedAt = new Date().toISOString();
  await supabase.from("website-clickup-flight-event-outbox").update({
    status: "retry",
    available_at: startedAt,
    processing_started_at: null,
    last_error: "A previous flight sync was interrupted and safely re-queued.",
  }).eq("workspace_id", integration.workspace_id).eq("status", "processing")
    .lt("processing_started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  await queueRequiredFlights(supabase, integration);
  const readyAt = new Date().toISOString();

  const { data: candidates, error: candidatesError } = await supabase
    .from("website-clickup-flight-event-outbox")
    .select("id,workspace_id,flight_event_id,operation,status,attempts")
    .eq("workspace_id", integration.workspace_id)
    .in("status", ["pending", "retry"])
    .lte("available_at", readyAt)
    .order("created_at")
    .limit(Math.min(100, Math.max(1, limit)));
  if (candidatesError) throw candidatesError;

  let succeeded = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const candidate of (candidates ?? []) as FlightOutboxItem[]) {
    const { data: claimed } = await supabase.from("website-clickup-flight-event-outbox").update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", candidate.id).in("status", ["pending", "retry"]).select("id").maybeSingle();
    if (!claimed) continue;
    try {
      if (candidate.operation === "upsert") {
        await upsertRemoteFlight({ flightEventId: candidate.flight_event_id, integration, supabase });
      } else {
        await removeRemoteFlight({ flightEventId: candidate.flight_event_id, integration, operation: candidate.operation, supabase });
      }
      await markComplete(supabase, candidate.id);
      await supabase.from("website-clickup-sync-audit").insert({
        workspace_id: integration.workspace_id,
        direction: "outbound",
        action: `flight_event_${candidate.operation}`,
        outcome: "completed",
        detail: "AutoPacific flight itinerary mirror updated.",
        flight_event_id: candidate.flight_event_id,
      });
      succeeded += 1;
    } catch (error) {
      lastError = await markFailure(supabase, candidate, error);
      failed += 1;
    }
  }

  await supabase.from("website-clickup-flight-event-outbox").delete()
    .eq("workspace_id", integration.workspace_id)
    .eq("status", "completed")
    .lt("completed_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  if (lastError) {
    await supabase.from("website-clickup-integrations").update({ last_error: lastError })
      .eq("workspace_id", integration.workspace_id);
  }
  const processed = succeeded + failed;
  return {
    status: "completed",
    processed,
    succeeded,
    failed,
    message: processed
      ? `${succeeded} flight update${succeeded === 1 ? "" : "s"} completed${failed ? ` · ${failed} queued to retry` : ""}.`
      : "ClickUp flight itineraries are already up to date.",
  };
}

export function scheduleClickUpFlightEventSync() {
  after(async () => {
    try {
      await dispatchClickUpFlightEventSync({ limit: 50 });
    } catch (error) {
      console.error("ClickUp flight sync failed after the CRM response.", error);
    }
  });
}
