import { calculateJobProgress } from "./job-progress";
import type { JobDeliverable } from "./job-deliverable-model";

export const progressStages = [
  { title: "Planning", color: "#8c9abc" },
  { title: "In production", color: "#366bfa" },
  { title: "Revisions", color: "#ad6b35" },
  { title: "In review", color: "#8259d3" },
  { title: "Ready", color: "#228397" },
  { title: "Complete", color: "#148468" },
] as const;

type ProgressJob = { title: string; deliverables?: JobDeliverable[]; status: { key: string; label: string } | null };
type ProgressShareTask = { title: string; source_deliverable_id: string | null; status: { key: string } | null };

const taskStages = new Map<string, number>([
  ["not_started", 0], ["in_progress", 1], ["ready_for_revision", 2],
  ["final_draft_notes", 3], ["ready_to_post", 4], ["posted_done", 5],
]);
export const jobWorkflow = ["Planning", "Scheduled", "Production", "Review", "Delivered"] as const;
const jobStages = new Map<string, number>([
  ["planning", 0], ["scheduled", 1], ["production", 2], ["in_production", 2],
  ["review", 3], ["client_review", 3], ["delivered", 4],
]);

/** Explicit public projection. Never spread a database row into this response. */
export function buildSharedJobProgress(job: ProgressJob, tasks: readonly ProgressShareTask[]) {
  const deliverables = job.deliverables ?? [];
  const statusKey = job.status?.key ?? "";
  const progress = calculateJobProgress({
    statusKey, deliverables,
    tasks: tasks.map(task => ({ source_deliverable_id: task.source_deliverable_id, status_key: task.status?.key })),
  });
  const represented = new Set(tasks.map(task => task.source_deliverable_id));
  const pending = new Map(deliverables.filter(item => !represented.has(item.id)).map(item => [item.id, item]));
  const grouped = progressStages.map(({ title, color }) => ({ title, color, items: [] as string[] }));
  for (const task of tasks) {
    if (task.status?.key !== "delayed") grouped[taskStages.get(task.status?.key ?? "") ?? 0].items.push(task.title);
  }
  for (const item of pending.values()) grouped[0].items.push(item.name);
  return {
    title: job.title, stageLabel: job.status?.label ?? "Not set", stageIndex: jobStages.get(statusKey) ?? -1,
    progress, stages: grouped,
  };
}

export type SharedJobProgress = ReturnType<typeof buildSharedJobProgress>;
export type ClientProgressAttachment = { id: string; name: string; size: number; viewable: boolean };
export type ClientJobProgress = SharedJobProgress & { deliveryUrl: string | null; attachments: ClientProgressAttachment[] };
export type ProgressFileAction = "view" | "download";

export function clientDeliveryUrl(value: string | null) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const browserPreviewTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4", "video/webm", "text/plain",
]);
export const canPreviewProgressFile = (mimeType: string) => browserPreviewTypes.has(mimeType);

export type JobProgressAccess = { pin: string; enabled: boolean };
export const shareIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
