import "server-only";

import { after } from "next/server";
import { CLICKUP_LIST_ID, CLICKUP_LIST_NAME, CLICKUP_STATUS_MAPPING, getClickUpToken } from "@/lib/clickup/config";
import { ClickUpApiError, createClickUpTask, deleteClickUpTask, getClickUpAuthorizedUser, getClickUpList, getClickUpTask, updateClickUpTask } from "@/lib/clickup/client";
import { buildClickUpJobDescription, buildClickUpJobPayload, buildClickUpJobUpdatePayload, buildClickUpOwnedFieldsPayload, type ClickUpJobSnapshot } from "@/lib/clickup/job-mapping";
import { changedSharedFields, isLegacyStatusRename, sharedStateFromClickUp, sharedStateFromCrm, sharedStateHash } from "@/lib/clickup/shared-state";
import { ensureClickUpWebhook } from "@/lib/clickup/webhook-registration";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { assignedToClickUpOwner } from "@/lib/clickup/assignment-scope";

type Integration = {
  workspace_id: string;
  target_client_id: string;
  list_id: string;
  list_name: string;
  enabled: boolean;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  deletion_mode: "archive" | "delete";
  status_mapping: Record<string, string>;
};

type SyncEvent = {
  id: string;
  workspace_id: string;
  job_id: string;
  operation: "upsert" | "archive" | "delete";
  status: "pending" | "retry";
  attempts: number;
};

export type ClickUpSyncResult = {
  status: "completed" | "disabled" | "not_configured" | "unavailable";
  processed: number;
  succeeded: number;
  failed: number;
  message: string;
};

function safeMessage(error: unknown) {
  if (error instanceof ClickUpApiError) {
    if (error.status === 401) return "ClickUp rejected the API token. Generate a new personal token and update CLICKUP_API_TOKEN in Vercel.";
    if (error.status === 403) return "Your ClickUp profile does not have permission to update the John / Jobs List.";
    if (error.status === 429) return "ClickUp is temporarily rate limiting the sync. This job will retry automatically.";
  }
  return (error instanceof Error ? error.message : "The ClickUp sync failed.").slice(0, 500);
}

function retryDelaySeconds(attempts: number) {
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempts - 1)));
}

async function markEventFailure(supabase: NonNullable<ReturnType<typeof createServiceClient>>, event: SyncEvent, error: unknown) {
  const attempts = event.attempts + 1;
  const terminal = attempts >= 8;
  const message = safeMessage(error);
  const availableAt = new Date(Date.now() + retryDelaySeconds(attempts) * 1_000).toISOString();
  await Promise.all([
    supabase.from("website-clickup-sync-outbox").update({
      status: terminal ? "failed" : "retry",
      attempts,
      available_at: availableAt,
      processing_started_at: null,
      last_error: message,
    }).eq("id", event.id),
    supabase.from("website-clickup-job-links").update({ last_error: message }).eq("workspace_id", event.workspace_id).eq("job_id", event.job_id),
  ]);
  return message;
}

async function markEventComplete(supabase: NonNullable<ReturnType<typeof createServiceClient>>, eventId: string) {
  await supabase.from("website-clickup-sync-outbox").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    processing_started_at: null,
    last_error: null,
  }).eq("id", eventId);
}

async function removeRemoteTask({
  integration,
  jobId,
  operation,
  supabase,
}: {
  integration: Integration;
  jobId: string;
  operation: SyncEvent["operation"];
  supabase: NonNullable<ReturnType<typeof createServiceClient>>;
}) {
  const { data: link, error } = await supabase
    .from("website-clickup-job-links")
    .select("id,clickup_task_id")
    .eq("workspace_id", integration.workspace_id)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!link) return;

  try {
    if (operation === "delete") await deleteClickUpTask(link.clickup_task_id);
    else await updateClickUpTask(link.clickup_task_id, { archived: true });
  } catch (error) {
    if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
  }
  await supabase.from("website-clickup-job-links").delete().eq("id", link.id);
}

async function recordOutboundConflict({
  clickUpSnapshot,
  crmSnapshot,
  integration,
  jobId,
  supabase,
  taskId,
}: {
  clickUpSnapshot: unknown;
  crmSnapshot: unknown;
  integration: Integration;
  jobId: string;
  supabase: NonNullable<ReturnType<typeof createServiceClient>>;
  taskId: string;
}) {
  const changedFields = changedSharedFields(
    crmSnapshot as Parameters<typeof changedSharedFields>[0],
    clickUpSnapshot as Parameters<typeof changedSharedFields>[1],
  );
  const { data: existing } = await supabase.from("website-clickup-conflicts").select("id")
    .eq("workspace_id", integration.workspace_id).eq("clickup_task_id", taskId).eq("status", "open").maybeSingle();
  const payload = {
    job_id: jobId,
    conflict_type: "concurrent_update",
    changed_fields: changedFields,
    crm_snapshot: crmSnapshot,
    clickup_snapshot: clickUpSnapshot,
  };
  if (existing) await supabase.from("website-clickup-conflicts").update(payload).eq("id", existing.id);
  else await supabase.from("website-clickup-conflicts").insert({
    workspace_id: integration.workspace_id,
    clickup_task_id: taskId,
    ...payload,
  });
  await Promise.all([
    supabase.from("website-clickup-job-links").update({ sync_state: "conflict" }).eq("workspace_id", integration.workspace_id).eq("job_id", jobId),
    supabase.from("website-notifications").insert({
      workspace_id: integration.workspace_id,
      type: "clickup_conflict",
      title: "ClickUp sync needs review",
      body: `Both systems changed: ${changedFields.join(", ")}.`,
      entity_type: "job",
      entity_id: jobId,
    }),
  ]);
}

async function upsertRemoteTask({
  integration,
  jobId,
  supabase,
}: {
  integration: Integration;
  jobId: string;
  supabase: NonNullable<ReturnType<typeof createServiceClient>>;
}) {
  const { data: job, error: jobError } = await supabase
    .from("website-jobs")
    .select("id,title,job_number,description,brief_details,deliverables,shoot_date,shoot_time,due_date,due_time,location,delivery_url,photos_delivered,notes,client_id,status_id,updated_at,archived_at,assignee_ids")
    .eq("workspace_id", integration.workspace_id)
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job || job.archived_at || job.client_id !== integration.target_client_id) {
    await removeRemoteTask({ integration, jobId, operation: integration.deletion_mode, supabase });
    return;
  }
  if (!await assignedToClickUpOwner(supabase, integration.workspace_id, job.assignee_ids)) return;

  const { data: status, error: statusError } = await supabase
    .from("website-job-statuses")
    .select("key")
    .eq("workspace_id", integration.workspace_id)
    .eq("id", job.status_id)
    .single();
  if (statusError || !status) throw statusError ?? new Error("The CRM job status could not be resolved.");
  const clickUpStatus = integration.status_mapping[status.key];
  if (!clickUpStatus) throw new Error(`No ClickUp status is mapped for CRM status '${status.key}'.`);
  if (!integration.assigned_user_id) throw new Error("The ClickUp assignee has not been connected.");

  const snapshot: ClickUpJobSnapshot = {
    brief_details: job.brief_details,
    deliverables: job.deliverables,
    id: job.id,
    title: job.title,
    job_number: job.job_number,
    description: job.description,
    shoot_date: job.shoot_date,
    shoot_time: job.shoot_time,
    due_date: job.due_date,
    due_time: job.due_time,
    location: job.location,
    delivery_url: job.delivery_url,
    photos_delivered: Number(job.photos_delivered ?? 0),
    notes: job.notes,
  };
  const { data: link, error: linkError } = await supabase
    .from("website-clickup-job-links")
    .select("id,clickup_task_id,last_shared_hash")
    .eq("workspace_id", integration.workspace_id)
    .eq("job_id", job.id)
    .maybeSingle();
  if (linkError) throw linkError;

  let taskId = link?.clickup_task_id ?? null;
  let taskUrl: string | null = null;
  const desiredState = sharedStateFromCrm(job, clickUpStatus);
  const desiredHash = sharedStateHash(desiredState);
  if (taskId) {
    try {
      const currentTask = await getClickUpTask(taskId);
      const remoteState = sharedStateFromClickUp(currentTask);
      const remoteHash = isLegacyStatusRename(remoteState, link?.last_shared_hash as string | null) ? link!.last_shared_hash as string : sharedStateHash(remoteState);
      const lastHash = link?.last_shared_hash as string | null;
      if (remoteHash === desiredHash) {
        if ((currentTask.markdown_description ?? "") !== buildClickUpJobDescription(snapshot)) {
          await updateClickUpTask(taskId, buildClickUpOwnedFieldsPayload({ assignedUserId: integration.assigned_user_id, job: snapshot }));
        }
        taskUrl = currentTask.url ?? `https://app.clickup.com/t/${taskId}`;
      } else if (lastHash && remoteHash !== lastHash && desiredHash !== lastHash) {
        await recordOutboundConflict({ clickUpSnapshot: remoteState, crmSnapshot: desiredState, integration, jobId: job.id, supabase, taskId });
        return "conflict" as const;
      } else if (lastHash && remoteHash !== lastHash && desiredHash === lastHash) {
        await supabase.from("website-clickup-webhook-events").upsert({
          workspace_id: integration.workspace_id,
          webhook_id: "outbound-guard",
          dedupe_key: `outbound-guard:${taskId}:${currentTask.date_updated ?? remoteHash}`,
          clickup_task_id: taskId,
          event_type: "outboundGuard",
          payload: { event: "outboundGuard", task_id: taskId },
          status: "pending",
          attempts: 0,
          available_at: new Date().toISOString(),
        }, { onConflict: "dedupe_key", ignoreDuplicates: true });
        return "deferred" as const;
      } else {
        const task = await updateClickUpTask(taskId, buildClickUpJobUpdatePayload({ assignedUserId: integration.assigned_user_id, job: snapshot, status: clickUpStatus }));
        taskUrl = task.url ?? `https://app.clickup.com/t/${taskId}`;
      }
    } catch (error) {
      if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
      await supabase.from("website-clickup-job-links").delete().eq("id", link?.id);
      taskId = null;
    }
  }

  if (!taskId) {
    const task = await createClickUpTask(integration.list_id, buildClickUpJobPayload({ assignedUserId: integration.assigned_user_id, job: snapshot, status: clickUpStatus }));
    taskId = task.id;
    taskUrl = task.url ?? `https://app.clickup.com/t/${task.id}`;
  }

  const now = new Date().toISOString();
  const { error: saveError } = await supabase.from("website-clickup-job-links").upsert({
    workspace_id: integration.workspace_id,
    job_id: job.id,
    clickup_task_id: taskId,
    clickup_task_url: taskUrl,
    ...(!link ? { origin: "crm" } : {}),
    source_updated_at: job.updated_at,
    last_shared_hash: desiredHash,
    last_synced_at: now,
    sync_state: "linked",
    last_error: null,
  }, { onConflict: "workspace_id,job_id" });
  if (saveError) throw saveError;
  return "synced" as const;
}

export async function dispatchClickUpJobSync({ limit = 20 } = {}): Promise<ClickUpSyncResult> {
  if (!getClickUpToken()) return { status: "not_configured", processed: 0, succeeded: 0, failed: 0, message: "ClickUp is awaiting its server token." };
  const supabase = createServiceClient();
  if (!supabase) return { status: "unavailable", processed: 0, succeeded: 0, failed: 0, message: "The server database connection is unavailable." };

  const { data: integrationData, error: integrationError } = await supabase
    .from("website-clickup-integrations")
    .select("workspace_id,target_client_id,list_id,list_name,enabled,assigned_user_id,assigned_user_name,deletion_mode,status_mapping")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .maybeSingle();
  if (integrationError) throw integrationError;
  const integration = integrationData as Integration | null;
  if (!integration?.enabled) return { status: "disabled", processed: 0, succeeded: 0, failed: 0, message: "ClickUp mirroring is paused." };

  const startedAt = new Date().toISOString();
  await supabase.from("website-clickup-integrations").update({ last_sync_started_at: startedAt }).eq("workspace_id", integration.workspace_id);
  await supabase.from("website-clickup-sync-outbox").update({
    status: "retry",
    available_at: startedAt,
    processing_started_at: null,
    last_error: "A previous sync was interrupted and has been safely re-queued.",
  }).eq("workspace_id", integration.workspace_id).eq("status", "processing").lt("processing_started_at", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: candidates, error: queueError } = await supabase
    .from("website-clickup-sync-outbox")
    .select("id,workspace_id,job_id,operation,status,attempts")
    .eq("workspace_id", integration.workspace_id)
    .in("status", ["pending", "retry"])
    .lte("available_at", startedAt)
    .order("created_at")
    .limit(Math.min(100, Math.max(1, limit)));
  if (queueError) throw queueError;

  let succeeded = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const candidate of (candidates ?? []) as SyncEvent[]) {
    const { data: claimed } = await supabase.from("website-clickup-sync-outbox").update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", candidate.id).in("status", ["pending", "retry"]).select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const outcome = candidate.operation === "upsert"
        ? await upsertRemoteTask({ integration, jobId: candidate.job_id, supabase })
        : await removeRemoteTask({ integration, jobId: candidate.job_id, operation: candidate.operation, supabase }).then(() => "synced" as const);
      await markEventComplete(supabase, candidate.id);
      await supabase.from("website-clickup-sync-audit").insert({
        workspace_id: integration.workspace_id,
        direction: "outbound",
        action: candidate.operation,
        outcome: outcome === "conflict" ? "conflict" : outcome === "deferred" ? "ignored" : "completed",
        detail: outcome === "conflict" ? "Both systems changed; queued for review." : outcome === "deferred" ? "A newer ClickUp change was queued for inbound processing." : "ClickUp mirror updated.",
        job_id: candidate.job_id,
      });
      succeeded += 1;
    } catch (error) {
      lastError = await markEventFailure(supabase, candidate, error);
      failed += 1;
    }
  }

  const completedAt = new Date().toISOString();
  await Promise.all([
    supabase.from("website-clickup-integrations").update({
      last_sync_completed_at: completedAt,
      last_error: lastError,
    }).eq("workspace_id", integration.workspace_id),
    supabase.from("website-clickup-sync-outbox").delete().eq("workspace_id", integration.workspace_id).eq("status", "completed").lt("completed_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);
  const processed = succeeded + failed;
  return {
    status: "completed",
    processed,
    succeeded,
    failed,
    message: processed ? `${succeeded} ClickUp update${succeeded === 1 ? "" : "s"} completed${failed ? ` · ${failed} queued to retry` : ""}.` : "ClickUp is connected and already up to date.",
  };
}

export function scheduleClickUpJobSync() {
  after(async () => {
    try {
      await dispatchClickUpJobSync({ limit: 20 });
    } catch (error) {
      console.error("ClickUp job sync failed after the CRM response.", error);
    }
  });
}

export async function connectClickUpJobSync() {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("The server database connection is unavailable.");
  if (!getClickUpToken()) throw new Error("Add CLICKUP_API_TOKEN to Vercel before connecting ClickUp.");

  const [{ user }, list] = await Promise.all([getClickUpAuthorizedUser(), getClickUpList(CLICKUP_LIST_ID)]);
  const availableStatuses = new Set((list.statuses ?? []).map((item) => item.status.trim().toUpperCase()));
  const requiredStatuses = Object.values(CLICKUP_STATUS_MAPPING);
  const missingStatuses = requiredStatuses.filter((status) => !availableStatuses.has(status));
  if (missingStatuses.length) throw new Error(`The John / Jobs List is missing these statuses: ${missingStatuses.join(", ")}.`);

  const { data: client, error: clientError } = await supabase
    .from("website-clients")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .ilike("name", "Autopacific Group")
    .is("archived_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (clientError || !client) throw new Error("The Autopacific Group client could not be found in the CRM.");

  const now = new Date().toISOString();
  const { error: configError } = await supabase.from("website-clickup-integrations").upsert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    target_client_id: client.id,
    list_id: CLICKUP_LIST_ID,
    list_name: list.name || CLICKUP_LIST_NAME,
    enabled: true,
    assigned_user_id: user.id,
    assigned_user_name: user.username,
    deletion_mode: "archive",
    status_mapping: CLICKUP_STATUS_MAPPING,
    last_connected_at: now,
    last_error: null,
  }, { onConflict: "workspace_id" });
  if (configError) throw configError;

  const { data: jobs, error: jobsError } = await supabase
    .from("website-jobs")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("client_id", client.id)
    .is("archived_at", null);
  if (jobsError) throw jobsError;
  if (jobs?.length) {
    const jobIds = jobs.map((job) => job.id);
    const { data: activeEvents, error: activeEventsError } = await supabase
      .from("website-clickup-sync-outbox")
      .select("id,job_id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .in("status", ["pending", "retry"])
      .in("job_id", jobIds);
    if (activeEventsError) throw activeEventsError;
    const activeJobIds = new Set((activeEvents ?? []).map((event) => event.job_id));
    const missingJobs = jobs.filter((job) => !activeJobIds.has(job.id));
    if (missingJobs.length) {
      const { error: queueError } = await supabase.from("website-clickup-sync-outbox").insert(missingJobs.map((job) => ({
        workspace_id: TRUSHOT_WORKSPACE_ID,
        job_id: job.id,
        operation: "upsert",
        status: "pending",
        attempts: 0,
        available_at: now,
      })));
      if (queueError) throw queueError;
    }
  }

  const sync = await dispatchClickUpJobSync({ limit: 100 });
  let webhook: Awaited<ReturnType<typeof ensureClickUpWebhook>> | null = null;
  let webhookWarning: string | null = null;
  try {
    webhook = await ensureClickUpWebhook();
  } catch (error) {
    webhookWarning = error instanceof Error ? error.message : "Inbound ClickUp observation could not be registered.";
    await supabase.from("website-clickup-integrations").update({ last_error: webhookWarning }).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  }
  return { user, list, queued: jobs?.length ?? 0, sync, webhook, webhookWarning };
}
