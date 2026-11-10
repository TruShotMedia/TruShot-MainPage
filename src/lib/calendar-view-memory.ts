import { format, isValid, parseISO } from "date-fns";

export type CalendarViewMode = "fortnight" | "week" | "day" | "hybrid";
export type CalendarViewMemory = { mode: CalendarViewMode; date: string; anchor: string };

export function calendarViewStorageKey(workspace: "autopacific" | "marketing", userId: string, space: string, mobile: boolean) {
  return `calendar-view:v1:${workspace}:${userId}:${space}:${mobile ? "mobile" : "desktop"}`;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseISO(value);
  return isValid(date) && format(date, "yyyy-MM-dd") === value;
}

/** Store preferences only: never calendar records, Outlook details or tokens. */
export function parseCalendarViewMemory(raw: string | null, today: string, defaultMode: CalendarViewMode): CalendarViewMemory {
  const fallback = { mode: defaultMode, date: today, anchor: today };
  if (!raw || raw.length > 512) return fallback;
  try {
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1 || !["fortnight", "week", "day", "hybrid"].includes(saved.mode)
      || !validDate(saved.date) || !validDate(saved.anchor)) return fallback;
    return { mode: saved.mode, date: saved.date, anchor: saved.anchor };
  } catch { return fallback; }
}
