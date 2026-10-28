import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { JobStatus } from "./types";
import type { JobDeliverable } from "./job-deliverable-model";

export type CampaignPlanJob = {
  assignee_ids?: string[];
  id: string; title: string; status_id: string; shoot_date: string | null; due_date: string | null;
  description: string | null; location: string | null; deliverables: JobDeliverable[];
  updated_at: string | null;
  tasks: { id: string; title: string; source_deliverable_id: string | null; completed_at: string | null }[];
};
export type CampaignPlanWeek = { id: string; title: string; jobs: CampaignPlanJob[] };
export type CampaignPlan = {
  assignee_ids?: string[];
  id: string; title: string; objective: string | null; notes: string | null;
  start_date: string; updated_at: string | null; weeks: CampaignPlanWeek[];
};

/** Web Crypto fallback for the older kiosk browser; still RFC 4122 v4. */
export function newCampaignId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function campaignWeekRange(startDate: string, index: number) {
  const start = addDays(parseISO(startDate), index * 7);
  return { start: format(start, "yyyy-MM-dd"), end: format(addDays(start, 6), "yyyy-MM-dd") };
}

/** A campaign cannot outrun its slowest actionable job, including mixed later stages. */
export function campaignProgress(plan: CampaignPlan, statuses: JobStatus[]) {
  const stages = statuses.filter(status => status.key !== "delayed").sort((a, b) => a.position - b.position);
  const byId = new Map(stages.map(status => [status.id, status]));
  const delayedIds = new Set(statuses.filter(status => status.key === "delayed").map(status => status.id));
  const jobs = plan.weeks.flatMap(week => week.jobs).filter(job => !delayedIds.has(job.status_id));
  const status = jobs.length
    ? jobs.reduce((least, job) => {
      const current = byId.get(job.status_id) ?? stages[0];
      return current && (!least || current.position < least.position) ? current : least;
    }, undefined as JobStatus | undefined)
    : stages.find(status => status.key === "planning") ?? stages[0];
  return {
    status, jobs: jobs.length, completed: jobs.filter(job => byId.get(job.status_id)?.is_closed).length,
    deliverables: jobs.reduce((sum, job) => sum + job.deliverables.length, 0),
  };
}

export function shiftCampaignWeek(week: CampaignPlanWeek, days: number, statuses: JobStatus[]): CampaignPlanWeek {
  const movable = new Set(statuses.filter(status => ["planning", "scheduled"].includes(status.key)).map(status => status.id));
  const shift = (date: string | null) => date ? format(addDays(parseISO(date), days), "yyyy-MM-dd") : null;
  return { ...week, jobs: week.jobs.map(job => movable.has(job.status_id) ? {
    ...job, shoot_date: shift(job.shoot_date), due_date: shift(job.due_date),
    deliverables: job.deliverables.map(item => ({ ...item, date: shift(item.date) })),
  } : job) };
}

export function changeCampaignStart(plan: CampaignPlan, start: string, statuses: JobStatus[]) {
  const days = differenceInCalendarDays(parseISO(start), parseISO(plan.start_date));
  return { ...plan, start_date: start, weeks: plan.weeks.map(week => shiftCampaignWeek(week, days, statuses)) };
}

export function newCampaignJob(statusId: string): CampaignPlanJob {
  return { id: newCampaignId(), title: "", status_id: statusId, shoot_date: null, due_date: null, description: null, location: null, deliverables: [], updated_at: null, tasks: [] };
}

export function newCampaignWeek(statusId: string): CampaignPlanWeek {
  return { id: newCampaignId(), title: "", jobs: [newCampaignJob(statusId)] };
}
