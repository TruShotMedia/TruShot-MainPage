// A small, deliberately limited RFC 5545 publisher. No HTML, links, attendees,
// attachments or alarms are accepted; only the server's safe projection below.
export type SubscriptionEvent = {
  uid: string; title: string; kind: string; start_date: string; start_time: string | null;
  end_date: string | null; end_time: string | null; is_all_day: boolean;
  location: string | null; detail: string | null; status: string | null;
  cancelled: boolean; tentative: boolean; transparent: boolean; updated_at: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
// A fixed publisher revision makes presentation-only corrections visible to
// subscribers even when the underlying CRM record has not been edited. Keep
// UIDs stable; do not use the current request time (which would churn the feed).
const publisherRevision = Date.parse("2026-11-09T23:39:58Z");
const publisherSequence = 1;
function day(value: string) {
  if (!datePattern.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date");
  return value.replaceAll("-", "");
}
function utc(value: Date) { return value.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function timed(date: string, time: string) {
  day(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) throw new Error("Invalid calendar time");
  // All native CRM dates/times use Australia/Brisbane (UTC+10, no DST).
  return new Date(Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}+10:00`));
}
function nextDay(value: string) { day(value); return new Date(Date.parse(`${value}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10); }
function escapeText(value: string) {
  return value.replaceAll(/\r\n|\r/g, "\n").replaceAll(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}
/** Fold at 75 UTF-8 octets, never inside a multibyte character. */
export function foldCalendarLine(line: string) {
  let result = "", length = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (length + size > 75) { result += "\r\n "; length = 1; }
    result += character; length += size;
  }
  return result;
}
export function serializeCalendar(events: readonly SubscriptionEvent[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//John CRM//AutoPacific Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:AutoPacific · My work", "X-WR-TIMEZONE:Australia/Brisbane", "X-WR-CALDESC:Read-only AutoPacific work. Edit in your CRM. Times use Brisbane time."];
  for (const event of [...events].sort((a, b) => a.uid.localeCompare(b.uid))) {
    if (!/^[a-z0-9-]+$/i.test(event.uid)) throw new Error("Invalid calendar identity");
    const modified = new Date(event.updated_at);
    if (!Number.isFinite(modified.getTime())) throw new Error("Invalid calendar revision");
    const detail = [event.kind, event.status ? `Status: ${event.status}` : "", event.detail ?? ""];
    const revision = utc(new Date(Math.max(modified.getTime(), publisherRevision)));
    const item = ["BEGIN:VEVENT", `UID:${event.uid}@calendar.trushotmedia.com`, `DTSTAMP:${revision}`, `LAST-MODIFIED:${revision}`, `SEQUENCE:${publisherSequence}`];
    if (event.is_all_day || !event.start_time) {
      const end = event.end_date ?? event.start_date;
      if (end < event.start_date) throw new Error("Invalid calendar window");
      item.push(`DTSTART;VALUE=DATE:${day(event.start_date)}`, `DTEND;VALUE=DATE:${day(nextDay(end))}`);
    } else {
      const start = timed(event.start_date, event.start_time);
      let finish = event.end_time ? timed(event.end_date ?? event.start_date, event.end_time) : null;
      if (finish && finish <= start) throw new Error("Invalid calendar window");
      if (!finish) {
        finish = new Date(start.getTime() + (event.transparent ? 15 : 60) * 60_000);
        if (!event.transparent) detail.push("Finish time not set; shown as a one-hour booking.");
      }
      item.push(`DTSTART:${utc(start)}`, `DTEND:${utc(finish)}`);
    }
    item.push(`SUMMARY:${escapeText(event.title)}`, `DESCRIPTION:${escapeText(detail.filter(Boolean).join("\n"))}`,
      // Outlook treats CLASS:PRIVATE as an instruction to hide appointment
      // titles. PUBLIC means normal item sensitivity, not a public feed: the
      // private bearer URL, owner checks and minimal projection still apply.
      `STATUS:${event.cancelled ? "CANCELLED" : event.tentative ? "TENTATIVE" : "CONFIRMED"}`, `TRANSP:${event.transparent || event.cancelled ? "TRANSPARENT" : "OPAQUE"}`, "CLASS:PUBLIC");
    if (event.location) item.push(`LOCATION:${escapeText(event.location)}`);
    lines.push(...item, "END:VEVENT");
  }
  return [...lines, "END:VCALENDAR"].map(foldCalendarLine).join("\r\n") + "\r\n";
}
