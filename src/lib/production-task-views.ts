import type { JobStatus, PipelineTask, TabletJobRecord, TaskStatus } from "@/lib/types";
import { compareCompletedRecords } from "./production-completed";

export type ProductionRecordView = "active" | "planning" | "completed";

export function productionTaskView(status: TaskStatus | undefined): ProductionRecordView | null {
  if (!status || status.key === "delayed") return null;
  if (status.key === "not_started" || status.key === "planning") return "planning";
  // Ready To Post is a legacy alias of the review column, not completed work.
  if (status.key === "ready_to_post") return "active";
  return status.is_open ? "active" : "completed";
}

export function tasksForProductionView(tasks: PipelineTask[], statuses: TaskStatus[], view: ProductionRecordView, search = "") {
  const byId = new Map(statuses.map(status => [status.id, status]));
  const query = search.trim().toLowerCase();
  return tasks.filter(task => productionTaskView(byId.get(task.status_id)) === view && `${task.title} ${task.job?.title ?? ""}`.toLowerCase().includes(query))
    .sort((left, right) => view === "completed"
      ? compareCompletedRecords(left, right)
      : (right.job?.shoot_date ?? "").localeCompare(left.job?.shoot_date ?? "") || left.title.localeCompare(right.title));
}

export function jobsForProductionView(jobs: TabletJobRecord[], statuses: JobStatus[], view: ProductionRecordView, search = "") {
  const byId = new Map(statuses.map(status => [status.id, status]));
  const query = search.trim().toLowerCase();
  const filtered = jobs.filter(job => {
    const status = byId.get(job.status_id);
    return (view === "planning" ? status?.key === "planning"
      : view === "completed" ? status?.key === "delivered"
      : !status?.is_closed && status?.key !== "planning") && job.title.toLowerCase().includes(query);
  });
  return view === "completed" ? filtered.sort(compareCompletedRecords) : filtered;
}

/** Board callbacks contain only the currently visible subset, never the whole workspace. */
export function mergeProductionRecords<T extends { id: string }>(existing: T[], changed: T[]) {
  const updates = new Map(changed.map(record => [record.id, record]));
  return existing.map(record => updates.get(record.id) ?? record);
}
