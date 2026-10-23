import "server-only";

import { createHash } from "node:crypto";
import type { ClickUpTask } from "@/lib/clickup/client";

export type ClickUpSharedState = {
  title: string;
  status: string;
  shoot_date: string | null;
  shoot_time: string | null;
  due_date: string | null;
  due_time: string | null;
};

export type CrmSharedJob = {
  title: string;
  shoot_date: string | null;
  shoot_time: string | null;
  due_date: string | null;
  due_time: string | null;
};

const brisbaneDateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Brisbane",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function normaliseTime(value: string | null | undefined) {
  return value?.slice(0, 5) || null;
}

function clickUpDate(value: string | null | undefined, includesTime?: boolean) {
  if (!value) return { date: null, time: null };
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return { date: null, time: null };
  const parts = Object.fromEntries(
    brisbaneDateTime.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  const inferredDateOnly = includesTime === undefined && time === "04:00";
  return { date, time: includesTime === false || inferredDateOnly ? null : time };
}

export function sharedStateFromCrm(job: CrmSharedJob, clickUpStatus: string): ClickUpSharedState {
  return {
    title: job.title.trim(),
    status: clickUpStatus.trim().toUpperCase(),
    shoot_date: job.shoot_date,
    shoot_time: normaliseTime(job.shoot_time),
    due_date: job.due_date,
    due_time: normaliseTime(job.due_time),
  };
}

export function sharedStateFromClickUp(task: ClickUpTask): ClickUpSharedState {
  const start = clickUpDate(task.start_date, task.start_date_time);
  const due = clickUpDate(task.due_date, task.due_date_time);
  return {
    title: task.name?.trim() || "Untitled ClickUp job",
    status: task.status?.status?.trim().toUpperCase() || "TO DO",
    shoot_date: start.date,
    shoot_time: start.time,
    due_date: due.date,
    due_time: due.time,
  };
}

export function sharedStateHash(state: ClickUpSharedState) {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

export function changedSharedFields(left: ClickUpSharedState, right: ClickUpSharedState) {
  return (Object.keys(left) as Array<keyof ClickUpSharedState>).filter((key) => left[key] !== right[key]);
}

export function clickUpUpdatedAt(task: ClickUpTask) {
  const timestamp = Number(task.date_updated);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
