import "server-only";
import { createHash } from "node:crypto";
import ical, { type DateWithTimeZone, type ParameterValue } from "node-ical";
import type { CalendarCustomEvent } from "@/lib/types";
import { OutlookFeedError } from "./feed";

function text(value: ParameterValue | undefined, max = 4000): string {
  return (typeof value === "string" ? value : value?.val ?? "").replace(/\u0000/g, "").slice(0, max);
}
function brisbaneParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (name: string) => parts.find(p => p.type === name)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
function allDayDate(date: DateWithTimeZone) {
  // node-ical preserves DATE values at local midnight, not UTC midnight.
  // Honour an explicit source timezone; otherwise use local calendar components.
  if (date.tz) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: date.tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export async function parseOutlookCalendar(body: string, calendarId: string, ownerId: string, name: string, now = new Date()): Promise<CalendarCustomEvent[]> {
  // Floating date-times have no zone. Interpret them in this CRM's Brisbane
  // calendar, rather than the deployment machine's UTC/local setting.
  const unfolded = body.replace(/\r?\n[ \t]/g, "");
  const normalized = unfolded.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi, block => block.replace(/^(DTSTART|DTEND|RECURRENCE-ID|EXDATE|RDATE):(?=\d{8}T\d{6}(?:,|\r?$))/gmi, "$1;TZID=Australia/Brisbane:"));
  const starts = (unfolded.match(/^BEGIN:VEVENT\s*$/gmi) ?? []).length;
  const ends = (unfolded.match(/^END:VEVENT\s*$/gmi) ?? []).length;
  if (starts !== ends) throw new OutlookFeedError("Outlook returned an incomplete calendar. Your saved events have not been changed.");
  if (starts > 1000 || /^RRULE(?:;[^:]*)?:[^\r\n]*(?:FREQ=(?:SECONDLY|MINUTELY|HOURLY)|BYSECOND=|BYMINUTE=|BYHOUR=)/mi.test(unfolded)) throw new OutlookFeedError("This calendar has too many or unusually frequent events to import safely.");
  try {
    const parsed = await ical.async.parseICS(normalized);
    const from = new Date(now); from.setUTCFullYear(from.getUTCFullYear() - 1); from.setUTCHours(0, 0, 0, 0);
    const to = new Date(now); to.setUTCFullYear(to.getUTCFullYear() + 1); to.setUTCHours(23, 59, 59, 999);
    const result: CalendarCustomEvent[] = [];
    for (const event of Object.values(parsed)) {
      if (!event || event.type !== "VEVENT" || event.status === "CANCELLED") continue;
      // Native CRM subscriptions can be overlaid in Outlook. Never re-import
      // our own published records and mirror them into ClickUp a second time.
      if (/@calendar\.trushotmedia\.com$/i.test(event.uid ?? "")) continue;
      if (!event.start || !Number.isFinite(event.start.getTime()) || !event.uid) throw new Error("Invalid event");
      const instances = ical.expandRecurringEvent(event, { from, to, expandOngoing: true, maxIterations: 4096 });
      for (const instance of instances) {
        if (instance.event.status === "CANCELLED") continue;
        if (result.length >= 2000) throw new OutlookFeedError("This calendar contains over 2,000 events in the import window. Publish a smaller date range in Outlook.");
        const start = instance.isFullDay ? { date: allDayDate(instance.start), time: null } : brisbaneParts(instance.start);
        // iCalendar DTEND is exclusive. The CRM's all-day finish is inclusive.
        const exclusiveEndDate = instance.isFullDay ? new Date(`${allDayDate(instance.end)}T00:00:00Z`) : null;
        const inclusiveEnd = exclusiveEndDate ? new Date(exclusiveEndDate.getTime() - 86_400_000).toISOString().slice(0, 10) : "";
        const end = instance.isFullDay ? { date: inclusiveEnd < start.date ? start.date : inclusiveEnd, time: null } : brisbaneParts(instance.end);
        // A one-off retains its identity when moved. A recurring exception uses
        // its ORIGINAL occurrence time, not the replacement start time.
        const original = instance.event.recurrenceid ?? instance.start;
        const occurrence = instance.isRecurring || instance.isOverride
          ? instance.isFullDay ? allDayDate(original) : original.toISOString() : "single";
        const id = createHash("sha256").update(`${calendarId}:${event.uid}:${occurrence}`).digest("hex").slice(0, 32);
        result.push({ id: `outlook-${id}`, entity_type: "calendar-event", external_source: "outlook", external_calendar_name: name,
          assignee_ids: [ownerId], client_id: null, client_name: null, title: text(instance.summary, 180) || "Busy (Outlook)",
          description: text(instance.event.description) || null, location: text(instance.event.location, 300) || null,
          start_date: start.date, start_time: start.time, end_date: end.date, end_time: end.time,
          is_all_day: instance.isFullDay, color: "#647b91", reminder_offsets_minutes: [],
          created_at: "1970-01-01T00:00:00.000Z", updated_at: "1970-01-01T00:00:00.000Z" });
      }
    }
    return [...new Map(result.map(event => [event.id, { ...event, external_revision: createHash("sha256").update(JSON.stringify(event)).digest("hex").slice(0, 20) }])).values()].sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.id.localeCompare(b.id));
  } catch (error) {
    if (error instanceof OutlookFeedError) throw error;
    // Never return parser errors: they can contain private feed contents.
    throw new OutlookFeedError("This calendar could not be read safely. Your saved events have not been changed. Please check the published calendar or try again.");
  }
}
