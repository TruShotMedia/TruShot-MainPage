import "server-only";

import { after } from "next/server";
import {
  buildClickUpCalendarEventPayload,
  buildClickUpCalendarEventUpdatePayload,
  isClickUpCalendarEventComplete,
  type ClickUpCalendarEventSnapshot,
} from "@/lib/clickup/calendar-event-mapping";
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

type EventIntegration = {
  workspace_id: string;
  target_client_id: string;
  list_id: string;
  enabled: boolean;
  assigned_user_id: number | null;
  deletion_mode: "archive" | "delete";
  status_mapping: Record<string, string>;
};

type EventOutboxItem = {
  id: string;
  workspace_id: string;
  calendar_event_id: string;
  operation: "upsert" | "archive" | "delete";
  status: "pending" | "retry";
  attempts: number;
};

export type ClickUpCalendarEventSyncResult = {
  status: "completed" | "disabled" | "not_configured" | "unavailable";
  processed: number;
  succeeded: number;
  failed: number;
  message: string;
};

function safeMessage(error: unknown) {
  if (error instanceof ClickUpApiError) {
    if (error.status === 401) return "ClickUp rejected the API token.";
    if (error.status === 403) return "Your ClickUp profile cannot update AutoPacific calendar events.";
    if (error.status === 429) return "ClickUp is temporarily rate limiting calendar event syncing.";
  }
  return (error instanceof Error ? error.message : "The ClickUp calendar event sync failed.").slice(0, 500);
}

function retryDelaySeconds(attempts: number) {
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempts - 1)));
}

function eventStatuses(integration: EventIntegration) {
  return {
    open: integration.status_mapping.planning ?? "TO DO",
    complete: integration.status_mapping.delivered ?? "COMPLETE",
  };
}

async function markFailure(supabase: ServiceClient, item: EventOutboxItem, error: unknown) {
  const attempts = item.attempts + 1;
  const terminal = attempts >= 8;
  const message = safeMessage(error);
  await Promise.all([
    supabase.from("website-clickup-calendar-event-outbox").update({
      status: terminal ? "failed" : "retry",
      attempts,
      available_at: new Date(Date.now() + retryDelaySeconds(attempts) * 1_000).toISOString(),
      processing_started_at: null,
      last_error: message,
    }).eq("id", item.id),
    supabase.from("website-clickup-calendar-event-links").update({ last_error: message })
      .eq("workspace_id", item.workspace_id)
      .eq("calendar_event_id", item.calendar_event_id),
  ]);
  return message;
}

async function markComplete(supabase: ServiceClient, itemId: string) {
  await supabase.from("website-clickup-calendar-event-outbox").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    processing_started_at: null,
    last_error: null,
  }).eq("id", itemId);
}

async function removeRemoteEvent({
  calendarEventId,
  integration,
  operation,
  supabase,
}: {
  calendarEventId: string;
  integration: EventIntegration;
  operation: EventOutboxItem["operation"];
  supabase: ServiceClient;
}) {
  const { data: link, error } = await supabase
    .from("website-clickup-calendar-event-links")
    .select("id,clickup_task_id")
    .eq("workspace_id", integration.workspace_id)
    .eq("calendar_event_id", calendarEventId)
    .maybeSingle();
  if (error) throw error;
  if (!link) return;

  try {
    if (operation === "delete") await deleteClickUpTask(link.clickup_task_id);
    else await updateClickUpTask(link.clickup_task_id, { archived: true });
  } catch (error) {
    if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
  }
  await supabase.from("website-clickup-calendar-event-links").delete().eq("id", link.id);
}

async function upsertRemoteEvent({
  calendarEventId,
  integration,
  supabase,
}: {
  calendarEventId: string;
  integration: EventIntegration;
  supabase: ServiceClient;
}) {
  const { data: event, error: eventError } = await supabase
    .from("website-calendar-events")
    .select("id,title,description,location,start_date,start_time,end_date,end_time,is_all_day,client_id,updated_at")
    .eq("workspace_id", integration.workspace_id)
    .eq("id", calendarEventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event || event.client_id !== integration.target_client_id) {
    await removeRemoteEvent({ calendarEventId, integration, operation: integration.deletion_mode, supabase });
    return;
  }
  if (!integration.assigned_user_id) throw new Error("The ClickUp assignee has not been connected.");

  const snapshot: ClickUpCalendarEventSnapshot = {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    start_date: event.start_date,
    start_time: event.start_time,
    end_date: event.end_date,
    end_time: event.end_time,
    is_all_day: event.is_all_day,
  };
  const statuses = eventStatuses(integration);
  const desiredStatus = isClickUpCalendarEventComplete(snapshot) ? statuses.complete : statuses.open;
  const payloadInput = {
    assignedUserId: integration.assigned_user_id,
    completeStatus: statuses.complete,
    event: snapshot,
    openStatus: statuses.open,
  };
  const { data: link, error: linkError } = await supabase
    .from("website-clickup-calendar-event-links")
    .select("id,clickup_task_id")
    .eq("workspace_id", integration.workspace_id)
    .eq("calendar_event_id", event.id)
    .maybeSingle();
  if (linkError) throw linkError;

  let taskId = link?.clickup_task_id ?? null;
  let taskUrl: string | null = null;
  if (taskId) {
    try {
      const task = await updateClickUpTask(taskId, buildClickUpCalendarEventUpdatePayload(payloadInput));
      taskUrl = task.url ?? `https://app.clickup.com/t/${taskId}`;
    } catch (error) {
      if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
      await supabase.from("website-clickup-calendar-event-links").delete().eq("id", link?.id);
      taskId = null;
    }
  }
  if (!taskId) {
    const task = await createClickUpTask(integration.list_id, buildClickUpCalendarEventPayload(payloadInput));
    taskId = task.id;
    taskUrl = task.url ?? `https://app.clickup.com/t/${task.id}`;
  }

  const now = new Date().toISOString();
  const { error: saveError } = await supabase.from("website-clickup-calendar-event-links").upsert({
    workspace_id: integration.workspace_id,
    calendar_event_id: event.id,
    clickup_task_id: taskId,
    clickup_task_url: taskUrl,
    source_updated_at: event.updated_at,
    last_synced_at: now,
    last_synced_status: desiredStatus,
    sync_state: "linked",
    last_error: null,
  }, { onConflict: "workspace_id,calendar_event_id" });
  if (saveError) throw saveError;
}

async function queueRequiredEvents(supabase: ServiceClient, integration: EventIntegration) {
  const { data: events, error: eventsError } = await supabase
    .from("website-calendar-events")
    .select("id,title,description,location,start_date,start_time,end_date,end_time,is_all_day,updated_at")
    .eq("workspace_id", integration.workspace_id)
    .eq("client_id", integration.target_client_id);
  if (eventsError) throw eventsError;
  if (!events?.length) return 0;

  const eventIds = events.map((event) => event.id);
  const [{ data: links, error: linksError }, { data: active, error: activeError }] = await Promise.all([
    supabase.from("website-clickup-calendar-event-links")
      .select("calendar_event_id,last_synced_status,source_updated_at")
      .eq("workspace_id", integration.workspace_id)
      .in("calendar_event_id", eventIds),
    supabase.from("website-clickup-calendar-event-outbox")
      .select("calendar_event_id")
      .eq("workspace_id", integration.workspace_id)
      .in("status", ["pending", "retry", "processing"])
      .in("calendar_event_id", eventIds),
  ]);
  if (linksError || activeError) throw linksError ?? activeError;
  const linksByEvent = new Map((links ?? []).map((link) => [link.calendar_event_id, link]));
  const queuedIds = new Set((active ?? []).map((item) => item.calendar_event_id));
  const statuses = eventStatuses(integration);
  const required = events.filter((event) => {
    if (queuedIds.has(event.id)) return false;
    const link = linksByEvent.get(event.id);
    if (!link) return true;
    const snapshot = event as ClickUpCalendarEventSnapshot;
    const desiredStatus = isClickUpCalendarEventComplete(snapshot) ? statuses.complete : statuses.open;
    return link.last_synced_status !== desiredStatus || link.source_updated_at !== event.updated_at;
  });
  if (!required.length) return 0;
  const { error: queueError } = await supabase.from("website-clickup-calendar-event-outbox").insert(
    required.map((event) => ({
      workspace_id: integration.workspace_id,
      calendar_event_id: event.id,
      operation: "upsert",
      status: "pending",
      attempts: 0,
      available_at: new Date().toISOString(),
    })),
  );
  if (queueError) throw queueError;
  return required.length;
}

export async function dispatchClickUpCalendarEventSync({ limit = 50 } = {}): Promise<ClickUpCalendarEventSyncResult> {
  if (!getClickUpToken()) return { status: "not_configured", processed: 0, succeeded: 0, failed: 0, message: "ClickUp is awaiting its server token." };
  const supabase = createServiceClient();
  if (!supabase) return { status: "unavailable", processed: 0, succeeded: 0, failed: 0, message: "The server database connection is unavailable." };
  const { data: integrationData, error: integrationError } = await supabase
    .from("website-clickup-integrations")
    .select("workspace_id,target_client_id,list_id,enabled,assigned_user_id,deletion_mode,status_mapping")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .maybeSingle();
  if (integrationError) throw integrationError;
  const integration = integrationData as EventIntegration | null;
  if (!integration?.enabled) return { status: "disabled", processed: 0, succeeded: 0, failed: 0, message: "ClickUp mirroring is paused." };

  const startedAt = new Date().toISOString();
  await supabase.from("website-clickup-calendar-event-outbox").update({
    status: "retry",
    available_at: startedAt,
    processing_started_at: null,
    last_error: "A previous calendar event sync was interrupted and safely re-queued.",
  }).eq("workspace_id", integration.workspace_id).eq("status", "processing")
    .lt("processing_started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  await queueRequiredEvents(supabase, integration);
  const readyAt = new Date().toISOString();

  const { data: candidates, error: candidatesError } = await supabase
    .from("website-clickup-calendar-event-outbox")
    .select("id,workspace_id,calendar_event_id,operation,status,attempts")
    .eq("workspace_id", integration.workspace_id)
    .in("status", ["pending", "retry"])
    .lte("available_at", readyAt)
    .order("created_at")
    .limit(Math.min(100, Math.max(1, limit)));
  if (candidatesError) throw candidatesError;

  let succeeded = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const candidate of (candidates ?? []) as EventOutboxItem[]) {
    const { data: claimed } = await supabase.from("website-clickup-calendar-event-outbox").update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", candidate.id).in("status", ["pending", "retry"]).select("id").maybeSingle();
    if (!claimed) continue;
    try {
      if (candidate.operation === "upsert") {
        await upsertRemoteEvent({ calendarEventId: candidate.calendar_event_id, integration, supabase });
      } else {
        await removeRemoteEvent({ calendarEventId: candidate.calendar_event_id, integration, operation: candidate.operation, supabase });
      }
      await markComplete(supabase, candidate.id);
      await supabase.from("website-clickup-sync-audit").insert({
        workspace_id: integration.workspace_id,
        direction: "outbound",
        action: `calendar_event_${candidate.operation}`,
        outcome: "completed",
        detail: "AutoPacific calendar event mirror updated.",
        calendar_event_id: candidate.calendar_event_id,
      });
      succeeded += 1;
    } catch (error) {
      lastError = await markFailure(supabase, candidate, error);
      failed += 1;
    }
  }

  await supabase.from("website-clickup-calendar-event-outbox").delete()
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
      ? `${succeeded} calendar event update${succeeded === 1 ? "" : "s"} completed${failed ? ` · ${failed} queued to retry` : ""}.`
      : "ClickUp calendar events are already up to date.",
  };
}

export function scheduleClickUpCalendarEventSync() {
  after(async () => {
    try {
      await dispatchClickUpCalendarEventSync({ limit: 50 });
    } catch (error) {
      console.error("ClickUp calendar event sync failed after the CRM response.", error);
    }
  });
}
