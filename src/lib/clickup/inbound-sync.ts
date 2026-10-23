import "server-only";

import { ClickUpApiError, getClickUpTask, getClickUpTasks, type ClickUpTask } from "@/lib/clickup/client";
import { claimClickUpImport } from "@/lib/clickup/import-claim";
import {
  changedSharedFields,
  clickUpUpdatedAt,
  sharedStateFromClickUp,
  sharedStateFromCrm,
  sharedStateHash,
  type ClickUpSharedState,
} from "@/lib/clickup/shared-state";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

type InboundMode = "paused" | "observe" | "active";

type InboundIntegration = {
  workspace_id: string;
  target_client_id: string;
  list_id: string;
  inbound_mode: InboundMode;
  import_new_tasks: boolean;
  archive_on_remote_delete: boolean;
  reconciliation_enabled: boolean;
  assigned_user_id: number | null;
  status_mapping: Record<string, string>;
  last_reconciled_at: string | null;
};

type InboundEvent = {
  id: string;
  workspace_id: string;
  clickup_task_id: string;
  event_type: string;
  status: "pending" | "retry";
  attempts: number;
};

type EventOutcome = {
  status: "completed" | "observed" | "ignored" | "conflict";
  detail: string;
  jobId?: string | null;
};

function retryDelaySeconds(attempts: number) {
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempts - 1)));
}

function safeMessage(error: unknown) {
  if (error instanceof ClickUpApiError) {
    if (error.status === 401) return "ClickUp rejected the API token.";
    if (error.status === 403) return "The ClickUp user cannot read the Jobs List.";
    if (error.status === 429) return "ClickUp rate limited inbound reconciliation.";
  }
  return (error instanceof Error ? error.message : "Inbound ClickUp processing failed.").slice(0, 500);
}

async function audit(
  supabase: ServiceClient,
  integration: InboundIntegration,
  outcome: "completed" | "observed" | "ignored" | "conflict" | "failed",
  action: string,
  detail: string,
  jobId?: string | null,
  taskId?: string | null,
) {
  await supabase.from("website-clickup-sync-audit").insert({
    workspace_id: integration.workspace_id,
    direction: "inbound",
    action,
    outcome,
    detail: detail.slice(0, 500),
    job_id: jobId ?? null,
    clickup_task_id: taskId ?? null,
  });
}

async function completeEvent(supabase: ServiceClient, event: InboundEvent, outcome: EventOutcome) {
  await supabase.from("website-clickup-webhook-events").update({
    status: outcome.status,
    completed_at: new Date().toISOString(),
    processing_started_at: null,
    last_error: outcome.detail,
  }).eq("id", event.id);
}

async function failEvent(supabase: ServiceClient, event: InboundEvent, error: unknown) {
  const attempts = event.attempts + 1;
  const terminal = attempts >= 8;
  const message = safeMessage(error);
  await supabase.from("website-clickup-webhook-events").update({
    status: terminal ? "failed" : "retry",
    attempts,
    available_at: new Date(Date.now() + retryDelaySeconds(attempts) * 1_000).toISOString(),
    processing_started_at: null,
    last_error: message,
  }).eq("id", event.id);
  return message;
}

async function createConflict({
  changedFields,
  clickUpSnapshot,
  conflictType = "concurrent_update",
  crmSnapshot,
  integration,
  jobId,
  supabase,
  taskId,
}: {
  changedFields: string[];
  clickUpSnapshot: unknown;
  conflictType?: string;
  crmSnapshot: unknown;
  integration: InboundIntegration;
  jobId: string | null;
  supabase: ServiceClient;
  taskId: string;
}) {
  const { data: existing } = await supabase
    .from("website-clickup-conflicts")
    .select("id")
    .eq("workspace_id", integration.workspace_id)
    .eq("clickup_task_id", taskId)
    .eq("status", "open")
    .maybeSingle();
  const payload = {
    job_id: jobId,
    conflict_type: conflictType,
    changed_fields: changedFields,
    crm_snapshot: crmSnapshot,
    clickup_snapshot: clickUpSnapshot,
    updated_at: new Date().toISOString(),
  };
  if (existing) await supabase.from("website-clickup-conflicts").update(payload).eq("id", existing.id);
  else await supabase.from("website-clickup-conflicts").insert({
    workspace_id: integration.workspace_id,
    clickup_task_id: taskId,
    ...payload,
  });
  if (jobId) {
    await supabase.from("website-clickup-job-links").update({ sync_state: "conflict" })
      .eq("workspace_id", integration.workspace_id).eq("job_id", jobId);
  }
  await supabase.from("website-notifications").insert({
    workspace_id: integration.workspace_id,
    type: "clickup_conflict",
    title: "ClickUp sync needs review",
    body: `A Jobs List change needs a decision: ${changedFields.join(", ")}.`,
    entity_type: "job",
    entity_id: jobId,
  });
}

function reverseStatus(integration: InboundIntegration, clickUpStatus: string) {
  const normalised = clickUpStatus.trim().toUpperCase();
  return Object.entries(integration.status_mapping).find(([, value]) => value.trim().toUpperCase() === normalised)?.[0] ?? null;
}

function taskIsAssigned(task: ClickUpTask, assignedUserId: number | null) {
  if (!assignedUserId) return false;
  return (task.assignees ?? []).some((assignee) => Number(assignee.id) === assignedUserId);
}

function datesAreValid(state: ClickUpSharedState) {
  return !state.shoot_date || !state.due_date || state.due_date >= state.shoot_date;
}

async function statusIdForKey(supabase: ServiceClient, integration: InboundIntegration, key: string) {
  const { data, error } = await supabase.from("website-job-statuses").select("id")
    .eq("workspace_id", integration.workspace_id).eq("key", key).eq("is_active", true).maybeSingle();
  if (error || !data) throw new Error(`The CRM status '${key}' is unavailable.`);
  return data.id as string;
}

async function processDeletion(
  supabase: ServiceClient,
  integration: InboundIntegration,
  taskId: string,
): Promise<EventOutcome> {
  const { data: link } = await supabase.from("website-clickup-job-links").select("job_id")
    .eq("workspace_id", integration.workspace_id).eq("clickup_task_id", taskId).maybeSingle();
  if (!link) return { status: "ignored", detail: "Deleted ClickUp task was not linked to a CRM job." };
  if (integration.inbound_mode === "paused") return { status: "ignored", detail: "Inbound syncing was paused.", jobId: link.job_id };
  if (integration.inbound_mode === "observe") return { status: "observed", detail: "Observed a ClickUp deletion without changing the CRM.", jobId: link.job_id };
  if (!integration.archive_on_remote_delete) {
    await createConflict({
      changedFields: ["deleted"],
      clickUpSnapshot: { deleted: true },
      conflictType: "remote_delete",
      crmSnapshot: { archived: false },
      integration,
      jobId: link.job_id,
      supabase,
      taskId,
    });
    return { status: "conflict", detail: "Remote deletion awaits review.", jobId: link.job_id };
  }
  const archivedAt = new Date().toISOString();
  await supabase.from("website-clickup-job-links").update({ sync_state: "paused", last_inbound_at: archivedAt })
    .eq("workspace_id", integration.workspace_id).eq("clickup_task_id", taskId);
  const { error } = await supabase.from("website-jobs").update({ archived_at: archivedAt })
    .eq("workspace_id", integration.workspace_id).eq("id", link.job_id).is("archived_at", null);
  if (error) throw error;
  await supabase.from("website-job-tasks").update({ archived_at: archivedAt })
    .eq("workspace_id", integration.workspace_id).eq("job_id", link.job_id).is("archived_at", null);
  return { status: "completed", detail: "Archived the CRM job after its ClickUp task was deleted.", jobId: link.job_id };
}

async function processRemoteTask(
  supabase: ServiceClient,
  integration: InboundIntegration,
  task: ClickUpTask,
): Promise<EventOutcome> {
  const taskId = task.id;
  const { data: link } = await supabase.from("website-clickup-job-links")
    .select("job_id,last_shared_hash,sync_state")
    .eq("workspace_id", integration.workspace_id).eq("clickup_task_id", taskId).maybeSingle();

  if (integration.inbound_mode === "paused") return { status: "ignored", detail: "Inbound syncing was paused.", jobId: link?.job_id };
  if (integration.inbound_mode === "observe") return { status: "observed", detail: "Validated the ClickUp event in observation mode.", jobId: link?.job_id };

  const listMatches = String(task.list?.id ?? "") === integration.list_id;
  const assigned = taskIsAssigned(task, integration.assigned_user_id);
  const eligible = listMatches && assigned && !task.parent && !task.archived;
  if (!eligible) {
    if (!link) return { status: "ignored", detail: "Task did not match the Jobs List import rules." };
    const changed = !listMatches ? ["list"] : !assigned ? ["assignees"] : [task.archived ? "archived" : "parent"];
    await createConflict({
      changedFields: changed,
      clickUpSnapshot: { list_id: task.list?.id, assigned, archived: task.archived, parent: task.parent },
      conflictType: "scope_change",
      crmSnapshot: { linked: true },
      integration,
      jobId: link.job_id,
      supabase,
      taskId,
    });
    return { status: "conflict", detail: "A linked task moved outside the configured sync scope.", jobId: link.job_id };
  }

  const remoteState = sharedStateFromClickUp(task);
  const remoteHash = sharedStateHash(remoteState);
  const statusKey = reverseStatus(integration, remoteState.status);
  if (!statusKey) {
    if (link) {
      await createConflict({
        changedFields: ["status"],
        clickUpSnapshot: remoteState,
        conflictType: "unknown_status",
        crmSnapshot: null,
        integration,
        jobId: link.job_id,
        supabase,
        taskId,
      });
      return { status: "conflict", detail: `ClickUp status '${remoteState.status}' is not mapped.`, jobId: link.job_id };
    }
    return { status: "ignored", detail: `ClickUp status '${remoteState.status}' is not mapped.` };
  }
  if (!datesAreValid(remoteState)) {
    await createConflict({
      changedFields: ["shoot_date", "due_date"],
      clickUpSnapshot: remoteState,
      conflictType: "invalid_dates",
      crmSnapshot: null,
      integration,
      jobId: link?.job_id ?? null,
      supabase,
      taskId,
    });
    return { status: "conflict", detail: "ClickUp due date occurs before the start date.", jobId: link?.job_id };
  }
  const statusId = await statusIdForKey(supabase, integration, statusKey);

  if (!link) {
    if (!integration.import_new_tasks) return { status: "ignored", detail: "New ClickUp task imports are disabled." };
    const now = new Date().toISOString();

    // ClickUp commonly emits taskCreated, taskStatusUpdated, and
    // taskAssigneeUpdated within milliseconds of one another. Separate
    // serverless invocations can therefore reach this branch at the same
    // time. Claim the remote task through its unique link before creating the
    // CRM row so only one invocation can win the import.
    const claim = await claimClickUpImport({
      insertClaim: async (jobId) => {
        const { error } = await supabase.from("website-clickup-job-links").insert({
          workspace_id: integration.workspace_id,
          job_id: jobId,
          clickup_task_id: taskId,
          clickup_task_url: task.url ?? `https://app.clickup.com/t/${taskId}`,
          origin: "clickup",
          last_shared_hash: remoteHash,
          source_updated_at: now,
          last_clickup_updated_at: clickUpUpdatedAt(task),
          last_inbound_at: now,
          last_synced_at: now,
          sync_state: "linked",
        });
        return error;
      },
      findWinningJobId: async () => {
        const { data: winningLink, error: winningLinkError } = await supabase
          .from("website-clickup-job-links")
          .select("job_id")
          .eq("workspace_id", integration.workspace_id)
          .eq("clickup_task_id", taskId)
          .maybeSingle();
        if (winningLinkError) throw winningLinkError;
        return winningLink?.job_id ?? null;
      },
    });
    if (!claim.won) {
      return {
        status: "completed",
        detail: "Another ClickUp delivery already imported this job.",
        jobId: claim.jobId,
      };
    }
    const jobId = claim.jobId;

    const { data: job, error } = await supabase.from("website-jobs").insert({
      id: jobId,
      workspace_id: integration.workspace_id,
      client_id: integration.target_client_id,
      status_id: statusId,
      title: remoteState.title,
      shoot_date: remoteState.shoot_date,
      shoot_time: remoteState.shoot_time,
      due_date: remoteState.due_date,
      due_time: remoteState.due_time,
      description: "Created from the AutoPacific ClickUp Jobs List.",
      photos_delivered: 0,
    }).select("id").single();
    if (error || !job) {
      await supabase.from("website-clickup-job-links").delete()
        .eq("workspace_id", integration.workspace_id)
        .eq("job_id", jobId)
        .eq("clickup_task_id", taskId);
      throw error ?? new Error("The ClickUp task could not create a CRM job.");
    }
    await supabase.from("website-notifications").insert({
      workspace_id: integration.workspace_id,
      type: "clickup_job_imported",
      title: "New AutoPacific job imported",
      body: remoteState.title,
      entity_type: "job",
      entity_id: job.id,
    });
    return { status: "completed", detail: "Created a new CRM job from ClickUp.", jobId };
  }

  const { data: job, error: jobError } = await supabase.from("website-jobs")
    .select("id,title,status_id,shoot_date,shoot_time,due_date,due_time,updated_at,archived_at")
    .eq("workspace_id", integration.workspace_id).eq("id", link.job_id).maybeSingle();
  if (jobError) throw jobError;
  if (!job || job.archived_at) return { status: "ignored", detail: "The linked CRM job is archived or unavailable.", jobId: link.job_id };
  const { data: crmStatus, error: crmStatusError } = await supabase.from("website-job-statuses").select("key")
    .eq("workspace_id", integration.workspace_id).eq("id", job.status_id).single();
  if (crmStatusError || !crmStatus) throw crmStatusError ?? new Error("The CRM job status is unavailable.");
  const crmClickUpStatus = integration.status_mapping[crmStatus.key];
  if (!crmClickUpStatus) throw new Error(`No ClickUp status is mapped for CRM status '${crmStatus.key}'.`);
  const crmState = sharedStateFromCrm(job, crmClickUpStatus);
  const crmHash = sharedStateHash(crmState);
  const changedFields = changedSharedFields(crmState, remoteState);
  const lastHash = link.last_shared_hash as string | null;

  if (crmHash === remoteHash) {
    await supabase.from("website-clickup-job-links").update({
      last_shared_hash: remoteHash,
      source_updated_at: job.updated_at,
      last_clickup_updated_at: clickUpUpdatedAt(task),
      last_inbound_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      sync_state: "linked",
      last_error: null,
    }).eq("workspace_id", integration.workspace_id).eq("job_id", job.id);
    return { status: "completed", detail: "Both systems already contain the same shared job fields.", jobId: job.id };
  }
  if (!lastHash || (crmHash !== lastHash && remoteHash !== lastHash)) {
    await createConflict({
      changedFields,
      clickUpSnapshot: remoteState,
      crmSnapshot: crmState,
      integration,
      jobId: job.id,
      supabase,
      taskId,
    });
    return { status: "conflict", detail: "Both systems changed since their last shared state.", jobId: job.id };
  }
  if (remoteHash === lastHash && crmHash !== lastHash) {
    return { status: "ignored", detail: "A newer CRM change is already waiting to sync outward.", jobId: job.id };
  }

  const now = new Date().toISOString();
  await supabase.from("website-clickup-job-links").update({
    last_shared_hash: remoteHash,
    last_clickup_updated_at: clickUpUpdatedAt(task),
    last_inbound_at: now,
    last_synced_at: now,
    sync_state: "linked",
    last_error: null,
  }).eq("workspace_id", integration.workspace_id).eq("job_id", job.id);
  const { error: updateError } = await supabase.from("website-jobs").update({
    title: remoteState.title,
    status_id: statusId,
    shoot_date: remoteState.shoot_date,
    shoot_time: remoteState.shoot_time,
    due_date: remoteState.due_date,
    due_time: remoteState.due_time,
  }).eq("workspace_id", integration.workspace_id).eq("id", job.id).is("archived_at", null);
  if (updateError) throw updateError;
  return { status: "completed", detail: `Applied ClickUp changes: ${changedFields.join(", ")}.`, jobId: job.id };
}

async function processEvent(supabase: ServiceClient, integration: InboundIntegration, event: InboundEvent) {
  let outcome: EventOutcome;
  if (event.event_type === "taskDeleted") outcome = await processDeletion(supabase, integration, event.clickup_task_id);
  else {
    try {
      const task = await getClickUpTask(event.clickup_task_id);
      outcome = await processRemoteTask(supabase, integration, task);
    } catch (error) {
      if (error instanceof ClickUpApiError && error.status === 404) outcome = await processDeletion(supabase, integration, event.clickup_task_id);
      else throw error;
    }
  }
  await completeEvent(supabase, event, outcome);
  await audit(supabase, integration, outcome.status, event.event_type, outcome.detail, outcome.jobId, event.clickup_task_id);
  return outcome;
}

export async function dispatchClickUpInboundSync({ limit = 20 } = {}) {
  const supabase = createServiceClient();
  if (!supabase) return { status: "unavailable" as const, processed: 0, failed: 0, message: "The server database connection is unavailable." };
  const { data: integrationData, error: integrationError } = await supabase.from("website-clickup-integrations")
    .select("workspace_id,target_client_id,list_id,inbound_mode,import_new_tasks,archive_on_remote_delete,reconciliation_enabled,assigned_user_id,status_mapping,last_reconciled_at")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle();
  if (integrationError) throw integrationError;
  const integration = integrationData as InboundIntegration | null;
  if (!integration) return { status: "unavailable" as const, processed: 0, failed: 0, message: "ClickUp has not been connected." };
  const now = new Date().toISOString();
  await supabase.from("website-clickup-webhook-events").update({
    status: "retry",
    available_at: now,
    processing_started_at: null,
    last_error: "A previous inbound run was interrupted and safely re-queued.",
  }).eq("workspace_id", integration.workspace_id).eq("status", "processing")
    .lt("processing_started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const { data: candidates, error } = await supabase.from("website-clickup-webhook-events")
    .select("id,workspace_id,clickup_task_id,event_type,status,attempts")
    .eq("workspace_id", integration.workspace_id).in("status", ["pending", "retry"])
    .lte("available_at", now).order("created_at").limit(Math.min(100, Math.max(1, limit)));
  if (error) throw error;
  let processed = 0;
  let failed = 0;
  for (const candidate of (candidates ?? []) as InboundEvent[]) {
    const { data: claimed } = await supabase.from("website-clickup-webhook-events").update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", candidate.id).in("status", ["pending", "retry"]).select("id").maybeSingle();
    if (!claimed) continue;
    try {
      await processEvent(supabase, integration, candidate);
      processed += 1;
    } catch (eventError) {
      const message = await failEvent(supabase, candidate, eventError);
      await audit(supabase, integration, "failed", candidate.event_type, message, null, candidate.clickup_task_id);
      failed += 1;
    }
  }
  return {
    status: "completed" as const,
    processed,
    failed,
    message: processed || failed ? `${processed} inbound ClickUp event${processed === 1 ? "" : "s"} processed${failed ? ` · ${failed} queued to retry` : ""}.` : "Inbound ClickUp is already up to date.",
  };
}

export async function reconcileClickUpJobs({ force = false } = {}) {
  const supabase = createServiceClient();
  if (!supabase) return { status: "unavailable" as const, queued: 0, message: "The server database connection is unavailable." };
  const { data: integrationData, error } = await supabase.from("website-clickup-integrations")
    .select("workspace_id,target_client_id,list_id,inbound_mode,import_new_tasks,archive_on_remote_delete,reconciliation_enabled,assigned_user_id,status_mapping,last_reconciled_at")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle();
  if (error) throw error;
  const integration = integrationData as InboundIntegration | null;
  if (!integration?.reconciliation_enabled && !force) return { status: "disabled" as const, queued: 0, message: "ClickUp reconciliation is paused." };
  if (!integration) return { status: "unavailable" as const, queued: 0, message: "ClickUp has not been connected." };
  const lastRun = integration.last_reconciled_at ? Date.parse(integration.last_reconciled_at) : 0;
  if (!force && lastRun && Date.now() - lastRun < 15 * 60_000) {
    return { status: "skipped" as const, queued: 0, message: "Reconciliation ran recently." };
  }
  const updatedAfter = !force && lastRun ? Math.max(0, lastRun - 5 * 60_000) : undefined;
  const tasks: ClickUpTask[] = [];
  for (let page = 0; page < 10; page += 1) {
    const response = await getClickUpTasks(integration.list_id, { page, updatedAfter });
    tasks.push(...response.tasks);
    if (response.tasks.length < 100) break;
  }
  const now = new Date().toISOString();
  if (tasks.length) {
    const rows = tasks.map((task) => ({
      workspace_id: integration.workspace_id,
      webhook_id: "reconciliation",
      dedupe_key: `reconciliation:${integration.inbound_mode}:${task.id}:${task.date_updated ?? sharedStateHash(sharedStateFromClickUp(task))}`,
      clickup_task_id: task.id,
      event_type: "reconciliation",
      payload: { event: "reconciliation", task_id: task.id, date_updated: task.date_updated ?? null },
      status: "pending",
      attempts: 0,
      available_at: now,
    }));
    const { error: queueError } = await supabase.from("website-clickup-webhook-events")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (queueError) throw queueError;
  }
  await Promise.all([
    supabase.from("website-clickup-integrations").update({ last_reconciled_at: now }).eq("workspace_id", integration.workspace_id),
    supabase.from("website-clickup-webhook-events").delete().eq("workspace_id", integration.workspace_id)
      .in("status", ["completed", "observed", "ignored"]).lt("completed_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
    supabase.from("website-clickup-sync-audit").delete().eq("workspace_id", integration.workspace_id)
      .lt("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString()),
  ]);
  const dispatch = await dispatchClickUpInboundSync({ limit: 100 });
  return { status: "completed" as const, queued: tasks.length, message: `${tasks.length} ClickUp task${tasks.length === 1 ? "" : "s"} checked. ${dispatch.message}` };
}
