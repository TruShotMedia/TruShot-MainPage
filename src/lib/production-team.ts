import type { JobStatus, TabletKioskData } from "@/lib/types";

export type TeamRole = "manager" | "videographer" | "marketing";
export type TeamMember = { user_id: string; display_name: string; username: string; role: TeamRole; is_active: boolean; avatar_color: string; enabled_at?: string; is_primary_videographer?: boolean };
export type TeamDirectoryMember = TeamMember & { email: string };
export type TeamContextData = { userId: string; role: TeamRole | "admin"; members: TeamMember[]; videographerId: string; canManage: boolean };
export type ProductionSpace = "videographer" | "mine" | "team";
export type AssignedRecord = { assignee_ids?: string[] };

export function assignedTo(record: AssignedRecord, ids: readonly string[]) {
  return Boolean(record.assignee_ids?.some(id => ids.includes(id)));
}

/** Filtering is a view preference, never a replacement for database permission. */
export function scopeProductionSpace(data: TabletKioskData, ids: readonly string[], teamOnly = false): TabletKioskData {
  const pipelineJobs = data.pipelineJobs.filter(item => assignedTo(item, ids));
  const pipelineTasks = data.pipelineTasks.filter(item => assignedTo(item, ids));
  return { ...data, pipelineJobs, pipelineTasks,
    calendarJobs: data.calendarJobs.filter(item => assignedTo(item, ids)),
    calendarTasks: data.calendarTasks.filter(item => assignedTo(item, ids)),
    calendarCampaignAssets: data.calendarCampaignAssets.filter(item => assignedTo(item, ids)),
    calendarEvents: teamOnly ? [] : data.calendarEvents.filter(item => assignedTo(item, ids)),
    flightEvents: teamOnly ? [] : data.flightEvents.filter(item => assignedTo(item, ids)),
    // Keep the authorised job directory so a personal task can link to a shared brief.
    jobOptions: data.jobOptions,
  };
}

export function jobProgress(job: { total_tasks: number; completed_tasks?: number; open_tasks: number; status_id?: string; status?: JobStatus | null }, statuses: readonly JobStatus[] = []) {
  const completed = Math.min(job.total_tasks, Math.max(0, job.completed_tasks ?? job.total_tasks - job.open_tasks));
  if (job.total_tasks) return { completed, total: job.total_tasks, percent: Math.round(completed / job.total_tasks * 100) };

  const status = job.status ?? statuses.find(stage => stage.id === job.status_id);
  // Delayed is historical work, not another step towards delivery.
  const stages = statuses.filter(stage => stage.key !== "delayed").sort((a, b) => a.position - b.position);
  const index = stages.findIndex(stage => stage.id === status?.id);
  const percent = !status || status.key === "delayed" ? 0 : status.is_closed ? 100
    : index >= 0 && stages.length > 1 ? Math.round(index / (stages.length - 1) * 100) : 0;
  return { completed: 0, total: 0, percent };
}

export function teamInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
}

export function mentionedMembers(body: string, members: TeamMember[]) {
  const handles = new Set(Array.from(body.matchAll(/(?:^|\s)@([a-z0-9_.-]+)/gi), match => match[1].toLowerCase()));
  return members.filter(member => member.is_active && handles.has(member.username.toLowerCase())).map(member => member.user_id);
}

export type TeamComment = {
  id: string; body: string; created_by: string | null; updated_at: string; created_at: string;
  mention_user_ids: string[]; record_kind: "job" | "task"; job_id: string | null; task_id: string | null;
  record_title: string; unread: boolean;
};
