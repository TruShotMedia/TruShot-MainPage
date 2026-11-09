import { expect, it } from "vitest";
import ical, { type VEvent } from "node-ical";
import { foldCalendarLine, serializeCalendar, type SubscriptionEvent } from "./ical";
const event: SubscriptionEvent = { uid: "job-123-shoot", title: "Shoot", kind: "Job / shoot", start_date: "2026-11-10", start_time: "09:00:00", end_date: "2026-11-10", end_time: "11:00:00", is_all_day: false, location: "Brisbane", detail: null, status: "Scheduled", cancelled: false, tentative: false, transparent: false, updated_at: "2026-11-09T22:00:00Z" };
const parsed = (value: SubscriptionEvent) => Object.values(ical.sync.parseICS(serializeCalendar([value]))).find((item): item is VEvent => item?.type === "VEVENT")!;
it("round-trips Brisbane times as unambiguous UTC with stable identity and revision", () => {
  const result = parsed(event);
  expect(result.start.toISOString()).toBe("2026-11-09T23:00:00.000Z");
  expect(result.end!.toISOString()).toBe("2026-11-10T01:00:00.000Z");
  expect(result.uid).toBe("job-123-shoot@calendar.trushotmedia.com");
  expect(serializeCalendar([event])).toBe(serializeCalendar([event]));
});
it("uses exclusive all-day end dates, including month/year transitions", () => {
  const result = parsed({ ...event, start_date: "2026-12-31", end_date: "2027-01-02", is_all_day: true });
  const date = (value: Date) => value.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  expect(date(result.start)).toBe("2026-12-31");
  expect(date(result.end!)).toBe("2027-01-03");
  expect(serializeCalendar([{ ...event, start_date: "2026-12-31", end_date: "2027-01-02", is_all_day: true }])).toContain("DTEND;VALUE=DATE:20270103");
});
it("keeps flight travel across multiple dates", () => {
  const result = parsed({ ...event, uid: "flight-123", start_time: "23:00", end_date: "2026-11-11", end_time: "02:00" });
  expect(result.end!.getTime() - result.start.getTime()).toBe(3 * 3600_000);
});
it("publishes untimed deadlines as all-day transparent entries", () => {
  const text = serializeCalendar([{ ...event, start_time: null, end_time: null, transparent: true }]);
  expect(text).toContain("DTSTART;VALUE=DATE:20261110");
  expect(text).toContain("TRANSP:TRANSPARENT");
});
it("makes missing finish times explicit instead of making up a multiweek booking", () => {
  const result = parsed({ ...event, end_time: null });
  expect(result.end!.getTime() - result.start.getTime()).toBe(3600_000);
  expect(result.description).toContain("one-hour booking");
});
it("escapes content-line injection, commas, semicolons and backslashes", () => {
  const result = parsed({ ...event, title: "Hello, \\;\r\nEND:VEVENT\r\nBEGIN:VEVENT", location: "A;B,C" });
  expect(result.summary).toBe("Hello, \\;\nEND:VEVENT\nBEGIN:VEVENT");
  expect(result.location).toBe("A;B,C");
  const text = serializeCalendar([{ ...event, title: "x\r\nURL:https://attacker.example" }]);
  expect(text.split("\r\n").filter(line => line.startsWith("URL:"))).toHaveLength(0);
});
it("folds UTF-8 content within 75 bytes without breaking emoji", () => {
  const line = "SUMMARY:" + "拍摄 💪".repeat(50);
  const result = foldCalendarLine(line);
  expect(result.replaceAll("\r\n ", "")).toBe(line);
  for (const part of result.split("\r\n")) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
  expect(parsed({ ...event, title: line.slice(8) }).summary).toBe(line.slice(8));
});
it("publishes delayed instances as cancelled and transparent", () => {
  const text = serializeCalendar([{ ...event, cancelled: true }]);
  expect(text).toContain("STATUS:CANCELLED"); expect(text).toContain("TRANSP:TRANSPARENT");
  expect(text).not.toContain("VALARM"); expect(text).not.toContain("ATTACH"); expect(text).not.toContain("URL:");
});
it.each([{ start_date: "2026-02-30" }, { start_time: "25:00" }, { end_time: "08:00" }, { uid: "x\r\nATTACH:secret" }])("rejects invalid or injectable structural fields %j", value => {
  expect(() => serializeCalendar([{ ...event, ...value }])).toThrow();
});
