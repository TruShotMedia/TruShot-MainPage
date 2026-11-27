"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scheduleClickUpJobSync } from "@/lib/clickup/job-sync";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getProductionContext } from "@/lib/data/admin";
import { CALENDAR_DAY_MINUTES, CALENDAR_TIME_STEP, resizedCalendarEventTime } from "@/lib/calendar-event";
import { isAutoPacificCalendarJob, jobShootResizeWindow, resizedCalendarJobDates, type CalendarJobResizeResult, type CalendarJobSchedule } from "@/lib/calendar-job-resize";

const identity = { id: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }), date: z.iso.date(), edge: z.enum(["start", "end"]) };
const inputSchema = z.discriminatedUnion("axis", [
  z.object({ ...identity, axis: z.literal("date") }),
  z.object({ ...identity, axis: z.literal("time"), minute: z.int().min(0).lt(CALENDAR_DAY_MINUTES).multipleOf(CALENDAR_TIME_STEP) }),
]);
const schedule = "shoot_date,shoot_time,shoot_end_time,due_date,updated_at";
type JobRow = CalendarJobSchedule & { updated_at: string; assignee_ids: string[] | null; status: { key: string; is_closed: boolean } | null; client: { name: string } | null };

export async function resizeProductionCalendarJob(input: unknown): Promise<CalendarJobResizeResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid calendar date or time for the job." };
  const change = parsed.data;
  const context = await getProductionContext();
  if (!context || context.membership.workspace_id !== TRUSHOT_WORKSPACE_ID) {
    return { ok: false, error: "Sign in again before resizing this job." };
  }
  const stale = { ok: false, error: "This job changed or is no longer available. Refresh the calendar and try again." } as const;
  const { supabase, claims } = context;
  const { data: job, error } = await supabase.from("website-jobs")
    .select(`${schedule},assignee_ids,status:website-job-statuses!website-jobs-status-fkey(key,is_closed),client:website-clients(name)`)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("id", change.id).is("archived_at", null)
    .eq("updated_at", change.expectedUpdatedAt).maybeSingle<JobRow>();
  if (error || !job) return stale;
  if (!isAutoPacificCalendarJob({ client_name: job.client?.name ?? null }) || !job.status || job.status.is_closed
    || job.status.key === "delayed" || job.status.key === "planning"
    || (context.access === "autopacific" && context.team.role === "marketing" && !job.assignee_ids?.includes(claims.sub))) {
    return { ok: false, error: "This job’s schedule can’t be resized here." };
  }
  const { shoot_date, shoot_time, shoot_end_time, due_date, updated_at } = job;
  const before = { shoot_date, shoot_time, shoot_end_time, due_date, updated_at };
  let patch: Partial<CalendarJobSchedule>;
  if (change.axis === "date") {
    const dates = resizedCalendarJobDates(job, change.edge, change.date);
    if (!dates) return { ok: false, error: "Choose a weekday and keep the deadline on or after the shoot date." };
    if (dates.unchanged) return { ok: true, job: before };
    patch = change.edge === "start" ? { shoot_date: dates.shoot_date } : { due_date: dates.due_date };
  } else {
    const window = jobShootResizeWindow(job, change.date);
    const times = window && resizedCalendarEventTime(window, change.date, change.edge, change.minute);
    if (!times) return { ok: false, error: "Keep the shoot on the same day and at least 15 minutes long." };
    if (times.unchanged) return { ok: true, job: before };
    // For an unset finish, pin the end seen in the calendar when dragging the start.
    patch = change.edge === "start" ? { shoot_time: times.startTime, ...(!shoot_end_time ? { shoot_end_time: times.endTime } : {}) } : { shoot_end_time: times.endTime };
  }
  // Existing database triggers reconcile inherited task deadlines in the same
  // transaction when due_date changes. Explicit overrides stay untouched.
  const { data: saved, error: saveError } = await supabase.from("website-jobs")
    .update({ ...patch, updated_by: claims.sub })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("id", change.id).is("archived_at", null)
    .eq("updated_at", change.expectedUpdatedAt).select(schedule).maybeSingle<typeof before>();
  if (saveError) return { ok: false, error: "Couldn’t resize this job. Its schedule was not changed." };
  if (!saved) return stale;
  scheduleClickUpJobSync();
  for (const path of ["/autopacific", "/autopacific/mobile", "/marketing", "/tablet", "/admin/calendar", "/admin/jobs", "/admin/tasks", "/admin/pipeline", "/admin/overview"]) revalidatePath(path);
  return { ok: true, job: saved };
}
