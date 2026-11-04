import { createHash } from "node:crypto";

export type ClickUpAssetSnapshot = {
  id: string;
  title: string;
  description: string | null;
  asset_type: string | null;
  hours: number | string | null;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  due_time: string | null;
  due_date_is_override: boolean;
  status: { key: string } | null;
};
export type ClickUpAssetParent = {
  id: string; title: string; due_date: string | null; due_time: string | null; status_key?: string;
};

const statuses: Record<string, string> = {
  not_started: "SCHEDULED", in_progress: "EDITING", ready_for_revision: "APPROVAL",
  final_draft_notes: "APPROVAL", ready_to_post: "APPROVAL", delayed: "DELAYED", posted_done: "COMPLETE",
};
const priorities = { urgent: 1, high: 2, normal: 3, low: 4 } as const;

export function clickUpAssetMarker(workspaceId: string, taskId: string) {
  return `Synced from John's CRM · Asset ID: \`${taskId}\` · Workspace ID: \`${workspaceId}\``;
}

export function ownsClickUpAsset(description: string | undefined, workspaceId: string, taskId: string) {
  // ClickUp may return a plain-text description in its nested subtask summary.
  return Boolean(description?.split("\n").some(line => line.replaceAll("`", "").trim() === clickUpAssetMarker(workspaceId, taskId).replaceAll("`", "")));
}

export function buildClickUpAssetPayload({ workspaceId, assignedUserId, parentTaskId, task, job }: {
  workspaceId: string; assignedUserId: number; parentTaskId: string; task: ClickUpAssetSnapshot; job: ClickUpAssetParent;
}) {
  const key = task.status?.key ?? "";
  const status = key === "not_started" && job.status_key === "planning" ? "PLANNING" : statuses[key];
  if (!status) throw new Error(`No ClickUp status is mapped for asset status '${key}'.`);
  const date = task.due_date_is_override ? task.due_date : task.due_date ?? job.due_date;
  const time = task.due_time?.slice(0, 5) || (date === job.due_date ? job.due_time?.slice(0, 5) : null);
  const dueDate = date ? Date.parse(`${date}T${time || "00:00"}:00+10:00`) : null;
  if (dueDate !== null && !Number.isFinite(dueDate)) throw new Error("This asset has an invalid deadline.");
  const hours = task.hours === null ? null : Number(task.hours);
  const description = [
    `**Job:** ${job.title}`,
    task.description?.trim(),
    task.asset_type ? `**Asset type:** ${task.asset_type}` : null,
    hours !== null && Number.isFinite(hours) ? `**Hours logged:** ${hours}h` : null,
    `---\n${clickUpAssetMarker(workspaceId, task.id)}`,
  ].filter(Boolean).join("\n\n");
  return {
    name: task.title, parent: parentTaskId, markdown_content: description,
    status, priority: priorities[task.priority], assignees: [assignedUserId],
    archived: false, due_date: dueDate, due_date_time: Boolean(date && time),
  };
}

export function clickUpAssetPayloadHash(payload: ReturnType<typeof buildClickUpAssetPayload>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function clickUpAssetUpdatePayload(payload: ReturnType<typeof buildClickUpAssetPayload>) {
  return { ...payload, assignees: { add: payload.assignees, rem: [] } };
}
