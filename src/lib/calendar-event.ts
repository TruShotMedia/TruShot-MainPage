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
};

export type CalendarEventMoveResult =
  | { ok: true; dates: { start_date: string; end_date: string; updated_at: string } }
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
