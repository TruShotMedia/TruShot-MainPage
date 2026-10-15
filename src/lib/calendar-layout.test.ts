import { describe, expect, it } from "vitest";
import { buildCalendarRangeWeeks, getCalendarJobRanges, getCalendarScheduleRanges } from "@/lib/calendar-layout";
import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarFlightEvent, CalendarJob } from "@/lib/types";

function job(id: string, title: string, start: string | null, end: string | null, clientName = "Ravish Media"): CalendarJob {
  return {
    id,
    entity_type: "job",
    title,
    client_name: clientName,
    shoot_date: start,
    shoot_time: null,
    due_date: end,
    due_time: null,
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

  it("lays campaign assets into the same staggered date lanes as jobs", () => {
    const campaignAsset: CalendarCampaignAsset = {
      id: "77777777-7777-4777-8777-777777777777",
      entity_type: "campaign-asset",
      title: "Launch film",
      campaign_title: "Spring launch",
      client_name: "Ravish Media",
      start_date: "2026-08-14",
      start_time: null,
      due_date: "2026-08-18",
      due_time: null,
      priority: "high",
      status_label: "In Progress",
      status_color: "#4B78A8",
      is_complete: false,
    };
    const ranges = getCalendarScheduleRanges([
      job("88888888-8888-4888-8888-888888888888", "Production job", "2026-08-15", "2026-08-16"),
      campaignAsset,
    ]);
    const weeks = buildCalendarRangeWeeks(dayKeys, ranges);

    expect(ranges.find((range) => range.item.entity_type === "campaign-asset")).toMatchObject({ durationDays: 5 });
    expect(weeks[0].laneCount).toBe(2);
    expect(weeks[1].segments.find((segment) => segment.item.entity_type === "campaign-asset")).toMatchObject({ startsBeforeWeek: true, span: 2 });
  });

  it("draws calendar events across their complete start and finish window", () => {
    const calendarEvent: CalendarCustomEvent = {
      id: "99999999-9999-4999-8999-999999999999",
      entity_type: "calendar-event",
      title: "Interstate production",
      description: null,
      location: "Sydney",
      start_date: "2026-08-14",
      start_time: "09:00:00",
      end_date: "2026-08-18",
      end_time: "17:00:00",
      is_all_day: false,
      color: "#3975ad",
      reminder_offsets_minutes: [60, 0],
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const ranges = getCalendarScheduleRanges([calendarEvent]);
    const weeks = buildCalendarRangeWeeks(dayKeys, ranges);

    expect(ranges[0]).toMatchObject({ start: "2026-08-14", end: "2026-08-18", durationDays: 5 });
    expect(weeks[0].segments[0]).toMatchObject({ startColumn: 4, span: 3, endsAfterWeek: true });
    expect(weeks[1].segments[0]).toMatchObject({ startColumn: 0, span: 2, startsBeforeWeek: true });
  });

  it("breaks Autopacific work at weekends while preserving its original date window", () => {
    const autopacificDays = [
      "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ];
    const ranges = getCalendarJobRanges([
      job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Weekday production", "2026-10-06", "2026-10-14", "AUTOPACIFIC  GROUP"),
    ]);
    const weeks = buildCalendarRangeWeeks(autopacificDays, ranges);

    expect(ranges[0]).toMatchObject({
      start: "2026-10-06",
      end: "2026-10-14",
      durationDays: 7,
      weekdaysOnly: true,
    });
    expect(weeks[0].segments).toHaveLength(1);
    expect(weeks[0].segments[0]).toMatchObject({ startColumn: 1, span: 4, startsBeforeWeek: false, endsAfterWeek: false });
    expect(weeks[1].segments).toHaveLength(1);
    expect(weeks[1].segments[0]).toMatchObject({ startColumn: 0, span: 3, startsBeforeWeek: false, endsAfterWeek: false });
    expect(weeks.flatMap((week) => week.segments).every((segment) => segment.startColumn + segment.span <= 5)).toBe(true);
  });

  it("reserves a double-height lane for flight itineraries without overlapping work", () => {
    const flight: CalendarFlightEvent = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      entity_type: "flight-event",
      title: "Sydney production trip",
      departure_date: "2026-08-14",
      departure_time: "07:30:00",
      arrival_date: "2026-08-15",
      arrival_time: "09:05:00",
      origin_location: "Brisbane · BNE",
      destination_location: "Sydney · SYD",
      departure_airline: "Qantas",
      arrival_airline: "Qantas",
      departure_flight_number: "QF 501",
      arrival_flight_number: "QF 501",
      departure_terminal: "Domestic 3",
      arrival_terminal: "Domestic 3",
      travel_class: "Economy",
      seat_number: "14A",
      notes: null,
      accommodation_title: "The Old Clare",
      accommodation_location: "Chippendale",
      accommodation_notes: null,
      vehicle_title: null,
      vehicle_location: null,
      vehicle_notes: null,
      color: "#3975ad",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const ranges = getCalendarScheduleRanges([
      flight,
      job("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Overlapping production", "2026-08-14", "2026-08-16"),
    ]);
    const week = buildCalendarRangeWeeks(dayKeys, ranges)[0];
    const flightSegment = week.segments.find((segment) => segment.item.entity_type === "flight-event")!;
    const jobSegment = week.segments.find((segment) => segment.item.entity_type === "job")!;

    expect(flightSegment).toMatchObject({ startColumn: 4, span: 2, lane: 0, laneSpan: 2 });
    expect(jobSegment.lane).toBe(2);
    expect(week.laneCount).toBe(3);
  });
});
