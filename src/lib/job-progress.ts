import type { JobDeliverable } from "./job-deliverable-model";

export type JobProgress = { completed: number; total: number; percent: number };
export type ProgressTask = {
  source_deliverable_id?: string | null;
  status_key?: string | null;
  is_complete?: boolean;
};

// Workflow estimates, not time tracking. Shared by cards and ClickUp exports.
const taskStages: Record<string, number> = {
  not_started: 0,
  in_progress: 40,
  ready_for_revision: 70,
  final_draft_notes: 90,
  ready_to_post: 95,
  posted_done: 100,
};
const jobStages: Record<string, number> = {
  planning: 0,
  scheduled: 10,
  production: 50,
  in_production: 50,
  review: 90,
  client_review: 90,
  delivered: 100,
};

export function calculateJobProgress({ tasks = [], deliverables = [], statusKey }: {
  tasks?: readonly ProgressTask[];
  deliverables?: readonly JobDeliverable[];
  statusKey?: string | null;
}): JobProgress {
  // A delayed attempt is history; its actionable successor counts instead.
  const active = tasks.filter(task => task.status_key !== "delayed");
  const represented = new Set(tasks.map(task => task.source_deliverable_id).filter(Boolean));
  const uncreated = new Set(deliverables.filter(item => !represented.has(item.id)).map(item => item.id));
  const values = active.map(task => task.status_key
    ? taskStages[task.status_key] ?? 0
    : task.is_complete ? 100 : 0);
  const completed = values.filter(value => value === 100).length;
  const total = values.length + uncreated.size;
  if (!total) return { completed: 0, total: 0, percent: statusKey ? jobStages[statusKey] ?? 0 : 0 };
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / total);
  return { completed, total, percent: completed === total ? 100 : Math.min(99, average) };
}
