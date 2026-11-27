export const CALENDAR_EVENT_KINDS = ["event", "post"] as const;
export type CalendarEventKind = typeof CALENDAR_EVENT_KINDS[number];

export function isCalendarPost(item: { entity_type: string; event_kind?: CalendarEventKind }) {
  return item.entity_type === "calendar-event" && item.event_kind === "post";
}

export type CalendarEventWindow = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isAllDay: boolean;
};

export function calendarEventFormEntries(formData: FormData) {
  return {
    ...Object.fromEntries(formData),
    start_time: formData.get("start_time") ?? "",
    end_time: formData.get("end_time") ?? "",
  };
}

export function calendarEventWindowError(window: CalendarEventWindow) {
  if (window.endDate < window.startDate) return "The event cannot finish before it starts.";
  if (window.isAllDay) return null;
  if (!window.startTime || !window.endTime) return "Timed events need both a start and finish time.";
  if (window.endDate === window.startDate && window.endTime <= window.startTime) {
    return "The event must finish after its start time.";
  }
  return null;
}

export type CalendarEventMove = {
  id: string;
  expectedUpdatedAt: string;
  from: string;
  to: string;
  /** Present for timeline drops that change the time; date-only drags leave times unchanged. */
  startMinute?: number;
  resize?: { edge: CalendarResizeEdge; minute: number };
};

export type CalendarResizeEdge = "start" | "end";

export type CalendarEventMoveResult =
  | { ok: true; dates: { start_date: string; end_date: string; updated_at: string; start_time?: string | null; end_time?: string | null } }
  | { ok: false; error: string };

// Calendar dates are civil days in Brisbane, not instants in the browser’s zone.
export function shiftedCalendarEventDates(start: string, end: string, from: string, to: string) {
  if (from < start || from > end) return null;
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const delta = day(to) - day(from);
  const first = new Date(day(start) + delta);
  const last = new Date(day(end) + delta);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) ||
    first.getUTCFullYear() < 1 || last.getUTCFullYear() > 9999) return null;
  return { start_date: first.toISOString().slice(0, 10), end_date: last.toISOString().slice(0, 10) };
}

/** A weekly bar may start in an earlier week. Keep the grabbed day under the pointer. */
export function grabbedCalendarDay(days: readonly string[], left: number, width: number, clientX: number) {
  const column = width > 0 ? Math.floor((clientX - left) / width * days.length) : 0;
  return days[Math.max(0, Math.min(column, days.length - 1))];
}

export const CALENDAR_TIME_STEP = 15;
export const CALENDAR_DAY_MINUTES = 24 * 60;
const MINUTE_MICROS = 60_000_000;
const CLOCK_TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/;

type TimedCalendarEvent = {
  start_date: string; end_date: string; start_time: string | null; end_time: string | null; is_all_day: boolean;
};

function clockMicros(time: string | null) {
  const match = time?.match(CLOCK_TIME);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]), second = Number(match[3] ?? 0);
  const micros = Number((match[4] ?? "").padEnd(6, "0"));
  if (hour > 24 || minute > 59 || second > 59 || (hour === 24 && (minute || second || micros))) return null;
  return (hour * 60 + minute) * MINUTE_MICROS + second * 1_000_000 + micros;
}

function fromClockMicros(value: number) {
  const fraction = value % 1_000_000;
  const wholeSeconds = Math.floor(value / 1_000_000);
  const parts = [Math.floor(wholeSeconds / 3600), Math.floor(wholeSeconds / 60) % 60, wholeSeconds % 60];
  const clock = parts.map(part => String(part).padStart(2, "0")).join(":");
  return fraction ? `${clock}.${String(fraction).padStart(6, "0")}` : clock;
}

export function sameDayCalendarEventWindow(event: TimedCalendarEvent, date: string) {
  if (event.is_all_day || event.start_date !== date || event.end_date !== date) return null;
  const start = clockMicros(event.start_time), end = clockMicros(event.end_time);
  if (start === null || end === null || end <= start) return null;
  return { start, duration: end - start };
}

// Keep the booked duration, including seconds if present in the database.
export function shiftedCalendarEventTimes(event: TimedCalendarEvent, date: string, startMinute: number) {
  const window = sameDayCalendarEventWindow(event, date);
  if (!window || !Number.isInteger(startMinute) || startMinute < 0 || startMinute >= CALENDAR_DAY_MINUTES || startMinute % CALENDAR_TIME_STEP) return null;
  const start = startMinute * MINUTE_MICROS;
  const end = start + window.duration;
  if (end >= CALENDAR_DAY_MINUTES * MINUTE_MICROS) return null;
  return { times: { start_time: fromClockMicros(start), end_time: fromClockMicros(end) }, unchanged: start === window.start };
}

export function calendarTimeDrop(event: TimedCalendarEvent, date: string, deltaMinutes: number, firstMinute: number, lastMinute: number) {
  const window = sameDayCalendarEventWindow(event, date);
  // A horizontal drag or tiny vertical movement shouldn't snap an off-grid event.
  if (!window || !Number.isFinite(deltaMinutes) || Math.abs(deltaMinutes) < 5) return null;
  const first = Math.ceil(firstMinute / CALENDAR_TIME_STEP) * CALENDAR_TIME_STEP;
  const lastUs = Math.min(lastMinute * MINUTE_MICROS, CALENDAR_DAY_MINUTES * MINUTE_MICROS - 1);
  const last = Math.floor((lastUs - window.duration) / MINUTE_MICROS / CALENDAR_TIME_STEP) * CALENDAR_TIME_STEP;
  if (last < first) return null;
  const snapped = Math.round((window.start / MINUTE_MICROS + deltaMinutes) / CALENDAR_TIME_STEP) * CALENDAR_TIME_STEP;
  const startMinute = Math.min(last, Math.max(first, snapped));
  const shifted = shiftedCalendarEventTimes(event, date, startMinute);
  return shifted && !shifted.unchanged ? { startMinute, ...shifted.times } : null;
}

export function resizedCalendarEventTime(event: TimedCalendarEvent, date: string, edge: CalendarResizeEdge, minute: number) {
  const window = sameDayCalendarEventWindow(event, date);
  if (!window || !Number.isInteger(minute) || minute < 0 || minute >= CALENDAR_DAY_MINUTES || minute % CALENDAR_TIME_STEP) return null;
  const value = minute * MINUTE_MICROS;
  const start = edge === "start" ? value : window.start;
  const end = edge === "end" ? value : window.start + window.duration;
  if (end - start < CALENDAR_TIME_STEP * MINUTE_MICROS) return null;
  return {
    startMinute: start / MINUTE_MICROS, endMinute: end / MINUTE_MICROS,
    startTime: fromClockMicros(start), endTime: fromClockMicros(end),
    unchanged: value === (edge === "start" ? window.start : window.start + window.duration),
  };
}

/** Drag only the grabbed edge, snapping it to a quarter-hour without crossing the other edge. */
export function calendarResizeDrop(event: TimedCalendarEvent, date: string, edge: CalendarResizeEdge, deltaMinutes: number, firstMinute: number, lastMinute: number) {
  const window = sameDayCalendarEventWindow(event, date);
  if (!window || !Number.isFinite(deltaMinutes) || Math.abs(deltaMinutes) < 5) return null;
  const start = window.start / MINUTE_MICROS, end = (window.start + window.duration) / MINUTE_MICROS;
  const current = edge === "start" ? start : end;
  const first = Math.ceil((edge === "start" ? firstMinute : start + CALENDAR_TIME_STEP) / CALENDAR_TIME_STEP) * CALENDAR_TIME_STEP;
  const last = Math.floor((edge === "start" ? end - CALENDAR_TIME_STEP : Math.min(lastMinute, CALENDAR_DAY_MINUTES - 1)) / CALENDAR_TIME_STEP) * CALENDAR_TIME_STEP;
  if (last < first) return null;
  const snapped = Math.round((current + deltaMinutes) / CALENDAR_TIME_STEP) * CALENDAR_TIME_STEP;
  const minute = Math.min(last, Math.max(first, snapped));
  if ((minute - current) * deltaMinutes <= 0) return null;
  const resized = resizedCalendarEventTime(event, date, edge, minute);
  return resized ? { ...resized, minute } : null;
}
