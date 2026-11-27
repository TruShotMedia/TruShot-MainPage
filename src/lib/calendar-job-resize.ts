import { CALENDAR_DAY_MINUTES, type CalendarResizeEdge } from "./calendar-event";
import type { CalendarJob } from "./types";

export type CalendarJobSchedule = Pick<CalendarJob, "shoot_date" | "shoot_time" | "shoot_end_time" | "due_date">;
export type CalendarJobResize = { id: string; expectedUpdatedAt: string; edge: CalendarResizeEdge } & (
  { axis: "time"; date: string; minute: number } | { axis: "date"; date: string }
);
export type CalendarJobResizeResult =
  | { ok: true; job: CalendarJobSchedule & { updated_at: string } }
  | { ok: false; error: string };

export function isAutoPacificCalendarJob(job: Pick<CalendarJob, "client_name">) {
  return job.client_name?.trim().toLowerCase() === "autopacific group";
}

export function canResizeCalendarJob(job: CalendarJob) {
  return Boolean(job.shoot_date && job.updated_at && isAutoPacificCalendarJob(job) && !job.is_complete
    && !job.delay_info?.delayed_to && !["delayed", "planning"].includes(job.status_label.trim().toLowerCase())
    && (!job.due_date || job.due_date >= job.shoot_date));
}

export function isWeekdayJobResizeDate(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

/** The shoot block is one day's booking, not the job-to-deadline span. */
export function jobShootResizeWindow(job: CalendarJobSchedule, date: string) {
  if (!job.shoot_time || job.shoot_date !== date) return null;
  const start = job.shoot_time;
  const [hour, minute] = start.split(":").map(Number);
  const guessedEnd = Math.min(CALENDAR_DAY_MINUTES, hour * 60 + minute + 30);
  const end = job.shoot_end_time || `${String(Math.floor(guessedEnd / 60)).padStart(2, "0")}:${String(guessedEnd % 60).padStart(2, "0")}`;
  return { start_date: date, end_date: date, start_time: start, end_time: end, is_all_day: false };
}

export function resizedCalendarJobDates(job: CalendarJobSchedule, edge: CalendarResizeEdge, date: string) {
  if (!job.shoot_date || !isWeekdayJobResizeDate(date)) return null;
  const shoot_date = edge === "start" ? date : job.shoot_date;
  const due_date = edge === "end" ? date : job.due_date;
  if (due_date && due_date < shoot_date) return null;
  return { shoot_date, due_date, unchanged: shoot_date === job.shoot_date && due_date === job.due_date };
}

/** Weekend endpoints are rendered on the first/last visible weekday. */
export function jobVisibleResizeEdge(date: string, edge: CalendarResizeEdge) {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay();
  if (weekday !== 0 && weekday !== 6) return date;
  day.setUTCDate(day.getUTCDate() + (edge === "start" ? (weekday === 0 ? 1 : 2) : (weekday === 0 ? -2 : -1)));
  return day.toISOString().slice(0, 10);
}
