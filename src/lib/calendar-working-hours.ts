import { parseISO } from "date-fns";

export type WorkWindow = Readonly<{ start: number; end: number }>;

// Minutes on the Brisbane timetable, not UTC or the browser's clock.
const regularDay = { start: 7 * 60, end: 16 * 60 + 15 } satisfies WorkWindow;
const friday = { start: regularDay.start, end: 12 * 60 + 15 } satisfies WorkWindow;

export function videographerWorkingHours(date: string): WorkWindow | null {
  const day = parseISO(date).getDay();
  if (day >= 1 && day <= 4) return regularDay;
  return day === 5 ? friday : null;
}

export function workingHoursTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
