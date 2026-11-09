import { describe, expect, it } from "vitest";
import { parseOutlookCalendar } from "./parse";

const now = new Date("2026-11-10T00:00:00Z");
const wrap = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;
const event = (fields: string, id = "event-one") => `BEGIN:VEVENT\r\nUID:${id}\r\n${fields.replace(/\n/g, "\r\n")}\r\nEND:VEVENT`;
const parse = (body: string) => parseOutlookCalendar(body, "test-calendar", "private-owner", "Work Outlook", now);
describe("Outlook iCalendar projection", () => {
  it("converts UTC into Brisbane time and keeps the published title", async () => {
    const [row] = await parse(wrap(event("DTSTART:20261110T230000Z\nDTEND:20261111T000000Z\nSUMMARY:Team meeting\nLOCATION:Geebung")));
    expect(row).toMatchObject({ title: "Team meeting", start_date: "2026-11-11", start_time: "09:00", end_time: "10:00", external_source: "outlook", assignee_ids: ["private-owner"], reminder_offsets_minutes: [], client_id: null });
    expect(row.id).not.toContain("event-one");
  });
  it("interprets floating times in Brisbane, not server UTC", async () => {
    const [row] = await parse(wrap(event("DTSTART:20261110T090000\nDTEND:20261110T100000\nSUMMARY:Floating")));
    expect(row.start_time).toBe("09:00");
  });
  it("preserves Windows/Outlook timezone daylight saving", async () => {
    const [row] = await parse(wrap(event("DTSTART;TZID=AUS Eastern Standard Time:20261110T090000\nDTEND;TZID=AUS Eastern Standard Time:20261110T100000\nSUMMARY:Melbourne")));
    expect(row.start_time).toBe("08:00");
  });
  it("converts exclusive all-day end to an inclusive finish without shifting dates", async () => {
    const [row] = await parse(wrap(event("DTSTART;VALUE=DATE:20261110\nDTEND;VALUE=DATE:20261113\nSUMMARY:Conference")));
    expect(row).toMatchObject({ start_date: "2026-11-10", end_date: "2026-11-12", start_time: null, end_time: null, is_all_day: true });
  });
  it("expands recurrence with EXDATE and a moved instance", async () => {
    const rows = await parse(wrap(event("DTSTART:20261110T230000Z\nDTEND:20261111T000000Z\nRRULE:FREQ=DAILY;COUNT=4\nEXDATE:20261111T230000Z\nSUMMARY:Standup") + "\r\n" + event("RECURRENCE-ID:20261112T230000Z\nDTSTART:20261113T010000Z\nDTEND:20261113T020000Z\nSUMMARY:Moved standup")));
    expect(rows.map(row => [row.start_date, row.start_time, row.title])).toEqual([["2026-11-11", "09:00", "Standup"], ["2026-11-13", "11:00", "Moved standup"], ["2026-11-14", "09:00", "Standup"]]);
  });
  it("omits cancelled events and cancelled recurrence overrides", async () => {
    const rows = await parse(wrap(event("DTSTART:20261110T230000Z\nDTEND:20261111T000000Z\nRRULE:FREQ=DAILY;COUNT=2\nSUMMARY:Series") + "\r\n" + event("RECURRENCE-ID:20261111T230000Z\nDTSTART:20261111T230000Z\nDTEND:20261112T000000Z\nSTATUS:CANCELLED\nSUMMARY:Cancelled") + "\r\n" + event("DTSTART:20261110T000000Z\nSTATUS:CANCELLED", "cancelled")));
    expect(rows).toHaveLength(1);
  });
  it("is deterministic across unchanged refreshes and excludes out-of-window events", async () => {
    const body = wrap(event("DTSTART:20261110T230000Z\nDTEND:20261111T000000Z\nSUMMARY:Same") + "\r\n" + event("DTSTART:20301110T230000Z\nSUMMARY:Future", "far-future"));
    expect(await parse(body)).toEqual(await parse(body));
    expect(await parse(body)).toHaveLength(1);
  });
  it("does not invent details for busy-only publications", async () => {
    const [row] = await parse(wrap(event("DTSTART:20261110T230000Z\nDTEND:20261111T000000Z")));
    expect(row.title).toBe("Busy (Outlook)");
  });
  it("accepts an empty, valid calendar and rejects resource-heavy recurrences", async () => {
    expect(await parse(wrap(""))).toEqual([]);
    await expect(parse(wrap(event("DTSTART:20261110T230000Z\nRRULE:FREQ=SECONDLY")))).rejects.toThrow("frequent");
  });
  it("redacts parser errors rather than returning private content", async () => {
    await expect(parse(wrap(event("SUMMARY:Private meeting secret")))).rejects.toThrow("could not be read safely");
  });
});
