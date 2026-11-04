import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ClickUpApiError, createClickUpTask, getClickUpTask, updateClickUpTask, type ClickUpTask } from "./client";
import { buildClickUpAssetPayload, clickUpAssetPayloadHash, clickUpAssetUpdatePayload, ownsClickUpAsset, type ClickUpAssetParent, type ClickUpAssetSnapshot } from "./task-mapping";

type Integration = { workspace_id: string; list_id: string; assigned_user_id: number | null; sync_subtasks?: boolean };
type Link = {
  task_id: string; job_id: string; clickup_task_id: string | null; parent_clickup_task_id: string;
  last_payload_hash: string | null; create_attempted_at: string | null; archived_at: string | null;
};
type Input = { supabase: SupabaseClient; integration: Integration; jobId: string; job?: ClickUpAssetParent; parentTaskId?: string };
const linkColumns = "task_id,job_id,clickup_task_id,parent_clickup_task_id,last_payload_hash,create_attempted_at,archived_at";

export class ClickUpSubtaskDeferredError extends Error {}

function requireOwnedChild(task: ClickUpTask, integration: Integration) {
  if (!task.parent || String(task.list?.id ?? "") !== integration.list_id) {
    throw new Error("A managed ClickUp asset moved outside its subtask/List scope. Review it before retrying.");
  }
}

/** One integration lease serialises task reparenting across old/new job queues. */
async function syncAssets({ supabase, integration, jobId, job, parentTaskId }: Input) {
  if (!integration.sync_subtasks) return;
  if (!integration.assigned_user_id) throw new Error("Connect the ClickUp assignee before syncing assets.");
  const token = randomUUID();
  async function lease(action: "claim" | "renew" | "release") {
    const { data, error } = await supabase.rpc("website-clickup-subtask-lease", {
      p_workspace_id: integration.workspace_id, p_token: token, p_action: action,
    });
    if (error) throw error;
    return data === true;
  }
  if (!await lease("claim")) throw new ClickUpSubtaskDeferredError("Another asset sync is finishing; this job will retry.");
  const deadline = Date.now() + 45_000;
  let renewAt = Date.now() + 25_000, changes = 0;
  const counts = { created: 0, updated: 0, archived: 0, unchanged: 0 };
  async function beforeRequest() {
    if (Date.now() >= deadline || changes >= 20) throw new ClickUpSubtaskDeferredError("The next bounded asset batch will continue automatically.");
    if (Date.now() >= renewAt) {
      if (!await lease("renew")) throw new ClickUpSubtaskDeferredError("The asset sync lease expired; the job will retry safely.");
      renewAt = Date.now() + 25_000;
    }
  }
  async function save(taskId: string, values: Record<string, unknown>) {
    const { error } = await supabase.from("website-clickup-subtask-links").update({ ...values, updated_at: new Date().toISOString() })
      .eq("workspace_id", integration.workspace_id).eq("task_id", taskId);
    if (error) throw error;
  }
  const recoveryByParent = new Map<string, ClickUpTask[]>();
  async function recover(taskId: string, parentId: string, allowArchivedParent = false) {
    let children = recoveryByParent.get(parentId);
    if (!children) {
      await beforeRequest();
      const parent = await getClickUpTask(parentId, { includeSubtasks: true });
      if (String(parent.list?.id ?? "") !== integration.list_id || parent.parent || (!allowArchivedParent && parent.archived)) throw new Error("The ClickUp parent job is no longer in the configured List.");
      children = [];
      for (const summary of parent.subtasks ?? []) {
        await beforeRequest();
        const child = await getClickUpTask(summary.id);
        if (String(child.parent ?? "") === parentId && String(child.list?.id ?? "") === integration.list_id) children.push(child);
      }
      recoveryByParent.set(parentId, children);
    }
    const matches = children.filter(child => ownsClickUpAsset(child.markdown_description ?? child.description, integration.workspace_id, taskId));
    if (matches.length > 1) throw new Error("More than one ClickUp subtask carries this CRM asset identity. Review the duplicates before syncing.");
    return matches[0] ?? null;
  }
  try {
    const { data: rows, error: taskError } = job ? await supabase.from("website-job-tasks")
      .select("id,title,description,asset_type,hours,priority,due_date,due_time,due_date_is_override,status:website-task-statuses!website-job-tasks-status-fkey(key)")
      .eq("workspace_id", integration.workspace_id).eq("job_id", jobId).is("archived_at", null)
      : { data: [], error: null };
    if (taskError) throw taskError;
    const tasks = (rows ?? []) as unknown as ClickUpAssetSnapshot[];
    const { data: previous, error: previousError } = await supabase.from("website-clickup-subtask-links")
      .select(linkColumns).eq("workspace_id", integration.workspace_id).eq("job_id", jobId).is("archived_at", null);
    if (previousError) throw previousError;
    const activeIds = new Set(tasks.map(task => task.id));
    // Keep mappings after CRM deletion so we can archive the owned remote copy.
    for (const link of (previous ?? []) as Link[]) {
      if (activeIds.has(link.task_id)) continue;
      if (!link.clickup_task_id && link.create_attempted_at) {
        const recovered = await recover(link.task_id, link.parent_clickup_task_id, true);
        if (!recovered) throw new Error("ClickUp has not confirmed the removed asset's earlier creation. Cleanup will retry safely.");
        link.clickup_task_id = recovered.id;
        await save(link.task_id, { clickup_task_id: recovered.id });
      }
      if (link.clickup_task_id) {
        await beforeRequest();
        try {
          const remote = await getClickUpTask(link.clickup_task_id);
          requireOwnedChild(remote, integration);
          await beforeRequest();
          if (!remote.archived) { await updateClickUpTask(remote.id, { archived: true }); changes += 1; }
        } catch (error) { if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error; }
      }
      await save(link.task_id, { archived_at: new Date().toISOString(), last_payload_hash: null, last_error: null });
      counts.archived += 1;
    }
    if (!job || !parentTaskId || !tasks.length) return counts;
    const { data: known, error: knownError } = await supabase.from("website-clickup-subtask-links")
      .select(linkColumns).eq("workspace_id", integration.workspace_id).in("task_id", tasks.map(task => task.id));
    if (knownError) throw knownError;
    const links = new Map(((known ?? []) as Link[]).map(link => [link.task_id, link]));
    for (const task of tasks) {
      const payload = buildClickUpAssetPayload({ workspaceId: integration.workspace_id, assignedUserId: integration.assigned_user_id, parentTaskId, task, job });
      const hash = clickUpAssetPayloadHash(payload);
      let link = links.get(task.id);
      if (link?.clickup_task_id && !link.archived_at && link.last_payload_hash === hash) { counts.unchanged += 1; continue; }
      await beforeRequest();
      if (!link) {
        const { error } = await supabase.from("website-clickup-subtask-links").insert({
          workspace_id: integration.workspace_id, task_id: task.id, job_id: jobId, parent_clickup_task_id: parentTaskId,
        });
        if (error) throw error;
        link = { task_id: task.id, job_id: jobId, parent_clickup_task_id: parentTaskId, clickup_task_id: null, last_payload_hash: null, create_attempted_at: null, archived_at: null };
      }
      try {
        let remote: ClickUpTask | null = null;
        if (link.clickup_task_id) {
          try { remote = await getClickUpTask(link.clickup_task_id); }
          catch (error) {
            if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
            await save(task.id, { clickup_task_id: null, last_payload_hash: null, create_attempted_at: null });
            link.clickup_task_id = null; link.create_attempted_at = null;
          }
        }
        // A fresh reservation has never POSTed. Only uncertain previous creates
        // need a child scan, keeping normal saves cheap and rate-limit friendly.
        if (!remote && link.create_attempted_at) remote = await recover(task.id, link.parent_clickup_task_id);
        if (remote) {
          requireOwnedChild(remote, integration);
          if (remote.id === parentTaskId) throw new Error("A ClickUp job cannot also be its own asset.");
          await beforeRequest();
          await updateClickUpTask(remote.id, clickUpAssetUpdatePayload(payload));
          changes += 1; counts.updated += 1;
        } else {
          // Persist the reservation BEFORE POST. After a timeout/crash, recover
          // by identity; never repeat an ambiguous create and risk duplicates.
          if (link.create_attempted_at) throw new Error("ClickUp has not confirmed this asset's earlier creation. Recovery will retry without creating a duplicate.");
          await beforeRequest();
          await save(task.id, { create_attempted_at: new Date().toISOString() });
          try { remote = await createClickUpTask(integration.list_id, payload); }
          catch (error) {
            if (error instanceof ClickUpApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
              await save(task.id, { create_attempted_at: null });
            }
            throw error;
          }
          changes += 1; counts.created += 1;
        }
        if (!remote?.id) throw new Error("ClickUp did not confirm the asset ID. The next run will recover it safely.");
        await save(task.id, {
          job_id: jobId, parent_clickup_task_id: parentTaskId, clickup_task_id: remote.id,
          last_payload_hash: hash, archived_at: null, last_synced_at: new Date().toISOString(), last_error: null,
        });
      } catch (error) {
        await save(task.id, { last_error: (error instanceof Error ? error.message : "Asset sync failed.").slice(0, 500) });
        throw error;
      }
    }
    return counts;
  } finally {
    // A failed release expires on its own; never hide the original sync error.
    try { await lease("release"); } catch { /* bounded lease expiry is the fallback */ }
  }
}

export function syncClickUpJobSubtasks(input: Input & { job: ClickUpAssetParent; parentTaskId: string }) { return syncAssets(input); }
export function archiveClickUpJobSubtasks(input: Pick<Input, "supabase" | "integration" | "jobId">) { return syncAssets(input); }
