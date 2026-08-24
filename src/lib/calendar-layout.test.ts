import { describe, expect, it } from "vitest";
import { buildCalendarRangeWeeks, getCalendarJobRanges } from "@/lib/calendar-layout";
import type { CalendarJob } from "@/lib/types";

function job(id: string, title: string, start: string | null, end: string | null): CalendarJob {
  return {
    id,
    entity_type: "job",
    title,
    client_name: "Ravish Media",
    shoot_date: start,
    due_date: end,
    status_label: "In progress",
    status_color: "#397253",
    is_complete: false,
  };
}

const dayKeys = [
  "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16",
  "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23",
];

describe("calendar range layout", () => {
  it("spans inclusive dates, splits at week edges, and staggers overlapping jobs", () => {
    const ranges = getCalendarJobRanges([
      job("11111111-1111-4111-8111-111111111111", "Campaign A", "2026-08-14", "2026-08-16"),
      job("22222222-2222-4222-8222-222222222222", "Campaign B", "2026-08-15", "2026-08-18"),
      job("33333333-3333-4333-8333-333333333333", "Campaign C", "2026-08-09", "2026-08-11"),
    ]);
    const weeks = buildCalendarRangeWeeks(dayKeys, ranges);

    expect(ranges.find((range) => range.item.title === "Campaign A")?.durationDays).toBe(3);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].laneCount).toBe(2);

    const campaignA = weeks[0].segments.find((segment) => segment.item.title === "Campaign A")!;
    const campaignBFirstWeek = weeks[0].segments.find((segment) => segment.item.title === "Campaign B")!;
    const campaignBSecondWeek = weeks[1].segments.find((segment) => segment.item.title === "Campaign B")!;
    const campaignC = weeks[0].segments.find((segment) => segment.item.title === "Campaign C")!;

    expect(campaignA).toMatchObject({ startColumn: 4, span: 3, lane: 0, startsBeforeWeek: false, endsAfterWeek: false });
    expect(campaignBFirstWeek).toMatchObject({ startColumn: 5, span: 2, lane: 1, endsAfterWeek: true });
    expect(campaignBSecondWeek).toMatchObject({ startColumn: 0, span: 2, lane: 0, startsBeforeWeek: true });
    expect(campaignC).toMatchObject({ startColumn: 0, span: 2, lane: 0, startsBeforeWeek: true });
  });

  it("ignores incomplete or reversed job windows", () => {
    const ranges = getCalendarJobRanges([
      job("44444444-4444-4444-8444-444444444444", "No deadline", "2026-08-14", null),
      job("55555555-5555-4555-8555-555555555555", "Reversed", "2026-08-16", "2026-08-14"),
      job("66666666-6666-4666-8666-666666666666", "One day", "2026-08-14", "2026-08-14"),
    ]);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ item: { title: "One day" }, durationDays: 1 });
  });
});
