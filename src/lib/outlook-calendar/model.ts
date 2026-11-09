import type { CalendarCustomEvent } from "@/lib/types";

export type OutlookCalendarStatus = {
  id: string;
  name: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  event_count: number;
};

export const OUTLOOK_REFRESH_MINUTES = 15;

/** Align with the existing quarter-hour scheduler, without clock-drift skips. */
export function outlookNextSyncAt(now: Date, minutes = OUTLOOK_REFRESH_MINUTES) {
  const interval = OUTLOOK_REFRESH_MINUTES * 60_000;
  return new Date((Math.floor(now.getTime() / interval) + Math.ceil(minutes / OUTLOOK_REFRESH_MINUTES)) * interval).toISOString();
}

export function isOutlookEvent(event: CalendarCustomEvent) {
  return event.external_source === "outlook";
}
