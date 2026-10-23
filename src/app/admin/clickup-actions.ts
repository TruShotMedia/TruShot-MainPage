"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dispatchClickUpCalendarEventSync, scheduleClickUpCalendarEventSync } from "@/lib/clickup/calendar-event-sync";
import { dispatchClickUpInboundSync, reconcileClickUpJobs } from "@/lib/clickup/inbound-sync";
import { connectClickUpJobSync, dispatchClickUpJobSync, scheduleClickUpJobSync } from "@/lib/clickup/job-sync";
import { sharedStateHash, type ClickUpSharedState } from "@/lib/clickup/shared-state";
import { ensureClickUpWebhook } from "@/lib/clickup/webhook-registration";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";

async function requireIntegrationAdmin() {
  const context = await getAdminContext();
  if (!context || !["owner", "admin"].includes(context.membership.role)) {
    throw new Error("Only a workspace owner or admin can manage integrations.");
  }
  return context;
}

export async function connectClickUpIntegration() {
  await requireIntegrationAdmin();
  const result = await connectClickUpJobSync();
  const eventSync = await dispatchClickUpCalendarEventSync({ limit: 100 });
  revalidatePath("/admin/settings");
  return {
    ok: true as const,
    message: `Connected ${result.user.username} to ${result.list.name}. ${result.sync.message} ${eventSync.message}${result.webhookWarning ? ` Inbound setup: ${result.webhookWarning}` : " Inbound observation is registered."}`,
  };
}

export async function syncClickUpIntegration() {
  const context = await requireIntegrationAdmin();
  const now = new Date().toISOString();
  const [outboundRetry, eventRetry, inboundRetry] = await Promise.all([
    context.supabase.from("website-clickup-sync-outbox").update({
      status: "retry", attempts: 0, available_at: now, processing_started_at: null, completed_at: null, last_error: null,
    }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("status", "failed"),
    context.supabase.from("website-clickup-calendar-event-outbox").update({
      status: "retry", attempts: 0, available_at: now, processing_started_at: null, completed_at: null, last_error: null,
    }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("status", "failed"),
    context.supabase.from("website-clickup-webhook-events").update({
      status: "retry", attempts: 0, available_at: now, processing_started_at: null, completed_at: null, last_error: null,
    }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("status", "failed"),
  ]);
  if (outboundRetry.error || eventRetry.error || inboundRetry.error) throw new Error(outboundRetry.error?.message ?? eventRetry.error?.message ?? inboundRetry.error?.message ?? "Failed sync events could not be retried.");
  const inbound = await reconcileClickUpJobs({ force: true });
  const [outbound, events] = await Promise.all([
    dispatchClickUpJobSync({ limit: 100 }),
    dispatchClickUpCalendarEventSync({ limit: 100 }),
  ]);
  revalidatePath("/admin/settings");
  return { ok: outbound.status === "completed" && events.status === "completed", message: `${inbound.message} ${outbound.message} ${events.message}` };
}

export async function setClickUpIntegrationEnabled(enabled: boolean) {
  const context = await requireIntegrationAdmin();
  const { data, error } = await context.supabase
    .from("website-clickup-integrations")
    .update({ enabled, last_error: null })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The ClickUp integration could not be updated.");
  if (enabled) {
    scheduleClickUpJobSync();
    scheduleClickUpCalendarEventSync();
  }
  revalidatePath("/admin/settings");
  return { ok: true as const, message: enabled ? "ClickUp mirroring resumed." : "ClickUp mirroring paused." };
}

export async function registerClickUpInboundWebhook() {
  await requireIntegrationAdmin();
  const result = await ensureClickUpWebhook();
  revalidatePath("/admin/settings");
  return { ok: true as const, message: result.reused ? "ClickUp webhook verified and refreshed." : "ClickUp webhook registered in observation mode." };
}

export async function setClickUpInboundMode(value: string) {
  const mode = z.enum(["paused", "observe", "active"]).parse(value);
  const context = await requireIntegrationAdmin();
  const { data, error } = await context.supabase.from("website-clickup-integrations")
    .update({ inbound_mode: mode, last_error: null })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Inbound ClickUp mode could not be changed.");
  if (mode === "active") await reconcileClickUpJobs({ force: true });
  else await dispatchClickUpInboundSync({ limit: 100 });
  revalidatePath("/admin/settings");
  return { ok: true as const, message: mode === "active" ? "Inbound ClickUp syncing is active." : mode === "observe" ? "Inbound changes are being observed without CRM writes." : "Inbound ClickUp syncing is paused." };
}

export async function setClickUpInboundOption(optionValue: string, enabled: boolean) {
  const option = z.enum(["import_new_tasks", "archive_on_remote_delete", "reconciliation_enabled"]).parse(optionValue);
  const context = await requireIntegrationAdmin();
  const { data, error } = await context.supabase.from("website-clickup-integrations")
    .update({ [option]: Boolean(enabled) })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "ClickUp sync settings could not be changed.");
  revalidatePath("/admin/settings");
  return { ok: true as const, message: "ClickUp sync setting updated." };
}

async function queueJobForClickUp(context: Awaited<ReturnType<typeof requireIntegrationAdmin>>, jobId: string) {
  const now = new Date().toISOString();
  const { data: existing } = await context.supabase.from("website-clickup-sync-outbox").select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("job_id", jobId).in("status", ["pending", "retry"]).maybeSingle();
  if (existing) {
    await context.supabase.from("website-clickup-sync-outbox").update({
      operation: "upsert", status: "pending", attempts: 0, available_at: now, last_error: null,
    }).eq("id", existing.id);
  } else {
    await context.supabase.from("website-clickup-sync-outbox").insert({
      workspace_id: TRUSHOT_WORKSPACE_ID, job_id: jobId, operation: "upsert", status: "pending", attempts: 0, available_at: now,
    });
  }
}

export async function resolveClickUpConflict(conflictIdValue: string, resolutionValue: string) {
  const conflictId = z.string().uuid().parse(conflictIdValue);
  const resolution = z.enum(["crm", "clickup", "dismissed"]).parse(resolutionValue);
  const context = await requireIntegrationAdmin();
  const { data: conflict, error } = await context.supabase.from("website-clickup-conflicts")
    .select("id,job_id,clickup_task_id,conflict_type,crm_snapshot,clickup_snapshot")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("id", conflictId).eq("status", "open").single();
  if (error || !conflict) throw new Error(error?.message ?? "That ClickUp conflict is no longer open.");
  if (resolution === "clickup" && conflict.job_id) {
    if (conflict.conflict_type === "remote_delete") {
      const archivedAt = new Date().toISOString();
      await Promise.all([
        context.supabase.from("website-jobs").update({ archived_at: archivedAt }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("id", conflict.job_id),
        context.supabase.from("website-job-tasks").update({ archived_at: archivedAt }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("job_id", conflict.job_id).is("archived_at", null),
      ]);
    } else {
      const snapshot = z.object({
        title: z.string(), status: z.string(), shoot_date: z.string().nullable(), shoot_time: z.string().nullable(), due_date: z.string().nullable(), due_time: z.string().nullable(),
      }).parse(conflict.clickup_snapshot) as ClickUpSharedState;
      const { data: integration } = await context.supabase.from("website-clickup-integrations").select("status_mapping")
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID).single();
      const statusKey = Object.entries((integration?.status_mapping ?? {}) as Record<string, string>)
        .find(([, value]) => value.toUpperCase() === snapshot.status.toUpperCase())?.[0];
      if (!statusKey) throw new Error(`ClickUp status '${snapshot.status}' is not mapped.`);
      const { data: status } = await context.supabase.from("website-job-statuses").select("id")
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("key", statusKey).eq("is_active", true).single();
      if (!status) throw new Error("The matching CRM status is unavailable.");
      await context.supabase.from("website-clickup-job-links").update({
        last_shared_hash: sharedStateHash(snapshot), sync_state: "linked", last_inbound_at: new Date().toISOString(),
      }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("job_id", conflict.job_id);
      const { error: jobError } = await context.supabase.from("website-jobs").update({
        title: snapshot.title, status_id: status.id, shoot_date: snapshot.shoot_date, shoot_time: snapshot.shoot_time, due_date: snapshot.due_date, due_time: snapshot.due_time,
      }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("id", conflict.job_id);
      if (jobError) throw jobError;
    }
  } else if (resolution === "crm" && conflict.job_id) {
    await context.supabase.from("website-clickup-job-links").update({ sync_state: "linked" })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("job_id", conflict.job_id);
    await queueJobForClickUp(context, conflict.job_id);
  }
  await context.supabase.from("website-clickup-conflicts").update({
    status: resolution === "dismissed" ? "dismissed" : "resolved",
    resolution,
    resolved_at: new Date().toISOString(),
  }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("id", conflict.id);
  if (resolution === "crm") scheduleClickUpJobSync();
  revalidatePath("/admin/settings");
  return { ok: true as const, message: resolution === "crm" ? "TruShot was kept and queued for ClickUp." : resolution === "clickup" ? "The ClickUp version was applied safely." : "Conflict dismissed without changing either system." };
}
