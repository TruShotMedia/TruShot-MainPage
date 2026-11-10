import type { TabletJobRecord } from "./types";

const taskStages: Record<string, number> = {
  not_started: 0,
  in_progress: 1,
  ready_for_revision: 2,
  final_draft_notes: 2,
  ready_to_post: 2,
  posted_done: 3,
};
const jobStages = ["scheduled", "production", "review", "delivered"] as const;

/** Mirrors the private database rule. Planning is an explicit readiness gate;
 * delayed attempts are history, not unfinished work. Unknown stages fail safe. */
export function linkedTaskJobStatus(statusKey: string | undefined, tasks: readonly { status_key?: string; archived_at?: string | null }[]) {
  if (!statusKey || statusKey === "planning" || statusKey === "delayed") return null;
  let least = Infinity;
  for (const task of tasks) {
    if (task.archived_at || task.status_key === "delayed") continue;
    least = Math.min(least, taskStages[task.status_key ?? ""] ?? 0);
  }
  return Number.isFinite(least) ? jobStages[least] : null;
}

/** No client permission is inferred here: Postgres enforces the same rule on
 * every write, including stale/offline clients and ClickUp status updates. */
export function jobFollowsLinkedTasks(job: Pick<TabletJobRecord, "status" | "client" | "linked_tasks">) {
  return job.client?.name.trim().toLowerCase() === "autopacific group"
    && linkedTaskJobStatus(job.status?.key, job.linked_tasks ?? []) !== null;
}
