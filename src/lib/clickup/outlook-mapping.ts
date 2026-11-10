import { createHash } from "node:crypto";
import type { CalendarCustomEvent } from "@/lib/types";
import { buildClickUpCalendarEventPayload, isClickUpCalendarEventComplete } from "./calendar-event-mapping";

const marker = /\[JOHN_OUTLOOK_EVENT:([0-9a-f-]{36}):(outlook-[0-9a-f]{32})\]/i;
export function extractOutlookMirror(description?: string | null) {
  const match = description?.match(marker);
  return match ? { calendarId: match[1].toLowerCase(), eventId: match[2].toLowerCase() } : null;
}
export function outlookMirrorPayload(event: CalendarCustomEvent, calendarId: string, assignedUserId: number, openStatus: string, completeStatus: string, now: Date) {
  const payload = buildClickUpCalendarEventPayload({ event, assignedUserId, openStatus, completeStatus, now });
  const timing = event.is_all_day ? `${event.start_date} → ${event.end_date} · All day`
    : `${event.start_date} ${event.start_time} → ${event.end_date} ${event.end_time} (Brisbane time)`;
  return { ...payload, name: `[OUTLOOK] ${event.title}`, markdown_content: [
    "**Source:** Outlook calendar · One-way mirror",
    `**When:** ${timing}`,
    event.location ? `**Location:** ${event.location.replaceAll(/[\r\n]/g, " ")}` : null,
    "Update this event in Outlook. It completes automatically after the event ends.",
    `Synced from John's CRM\n[JOHN_OUTLOOK_EVENT:${calendarId}:${event.id}]`,
  ].filter(Boolean).join("\n\n"), notify_all: false };
}
export function outlookPayloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
export function eligibleOutlookEvents(events: CalendarCustomEvent[], knownIds: Set<string>, now: Date) {
  return events.filter(event => event.external_source === "outlook" && /^outlook-[0-9a-f]{32}$/.test(event.id)
    // Start with ongoing/upcoming work, not a year of historical appointments.
    // Existing mirrors stay managed and complete after their finish time.
    && (knownIds.has(event.id) || !isClickUpCalendarEventComplete(event, now)));
}
