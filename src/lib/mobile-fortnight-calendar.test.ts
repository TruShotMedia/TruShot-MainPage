import { describe, expect, it } from "vitest";
import { buildMobileFortnight, mobileRangeTime, mobileScheduleTone } from "./mobile-fortnight-calendar";
import type { ProductionScheduleData } from "./production-selected-day";
import type { CalendarCustomEvent, CalendarFlightEvent, CalendarJob, CalendarTask } from "./types";

const empty: ProductionScheduleData = { calendarJobs: [], calendarTasks: [], calendarEvents: [], flightEvents: [] };
const job = (id: string, overrides: Partial<CalendarJob> = {}): CalendarJob => ({
  id, title: id, entity_type: "job", client_name: "Autopacific Group", shoot_date: "2026-11-23", shoot_time: "09:00",
  due_date: "2026-11-27", due_time: "17:00", status_label: "Scheduled", status_color: "#579", is_complete: false, ...overrides,
});
const task = (id: string, time: string | null): CalendarTask => ({
  id, title: id, entity_type: "task", job_title: "Campaign", client_name: "Autopacific Group", due_date: "2026-11-24",
  due_time: time, priority: "normal", status_label: "Not started", status_color: "#579", is_complete: false,
});
const event: CalendarCustomEvent = { id: "meeting", title: "Meeting", entity_type: "calendar-event", client_id: "apg", client_name: "Autopacific Group",
  start_date: "2026-11-24", start_time: "10:00", end_date: "2026-11-24", end_time: "11:00", is_all_day: false,
  description: null, location: null, color: "#579", reminder_offsets_minutes: [], created_at: "", updated_at: "" };
const leg = (id: string, date: string, kind: "outbound" | "return"): CalendarFlightEvent => ({
  id, title: "Melbourne trip", entity_type: "flight-event", client_id: "apg", client_name: "Autopacific Group",
  travel_plan_id: "trip", leg_order: kind === "outbound" ? 0 : 1, leg_kind: kind, departure_date: date, arrival_date: date, departure_time: "09:00", arrival_time: "11:00",
  origin_location: "Brisbane", destination_location: "Melbourne", departure_airline: "Qantas", arrival_airline: "Qantas",
  departure_airline_code: "QF", arrival_airline_code: "QF", departure_flight_number: null, arrival_flight_number: null,
  departure_terminal: null, arrival_terminal: null, travel_class: null, seat_number: null, notes: null,
  accommodation_title: null, accommodation_location: null, accommodation_notes: null, vehicle_title: null, vehicle_location: null, vehicle_notes: null,
  color: "#579", created_at: "", updated_at: "",
});
describe("mobile fortnight projection", () => {
  it("always shows two Monday–Sunday weeks, including month boundaries", () => {
    const result = buildMobileFortnight("2026-11-29", empty);
    expect(result).toHaveLength(2);
    expect(result.map(week => week.days.length)).toEqual([7, 7]);
    expect(result[0].days[0].date).toBe("2026-11-23");
    expect(result[1].days[6].date).toBe("2026-12-06");
  });
  it("splits long job windows at week boundaries while keeping AutoPacific weekends clear", () => {
    const result = buildMobileFortnight("2026-11-23", { ...empty, calendarJobs: [job("Long shoot", { shoot_date: "2026-11-20", due_date: "2026-12-01" })] });
    expect(result[0].visibleSegments[0]).toMatchObject({ startColumn: 0, span: 5 });
    expect(result[1].visibleSegments[0]).toMatchObject({ startColumn: 0, span: 2 });
    expect(result[0].days.slice(5).map(day => day.count)).toEqual([0, 0]);
    expect(mobileRangeTime(result[0].visibleSegments[0], "2026-11-23")).toBe("");
  });
  it("bounds the visual density without dropping records or miscounting overflow", () => {
    const input = { ...empty, calendarJobs: Array.from({ length: 5 }, (_, index) => job(`Job ${index}`)),
      calendarTasks: [task("Late", "16:00"), task("Early", "09:00"), task("All day", null), task("Midday", "12:00"), task("Afternoon", "14:00"), task("Evening", "18:00")] };
    const before = JSON.stringify(input);
    const result = buildMobileFortnight("2026-11-23", input);
    expect(result[0].visibleSegments).toHaveLength(2);
    expect(result[0].visibleLanes).toBe(2);
    const tuesday = result[0].days[1];
    expect(tuesday.count).toBe(11);
    expect(tuesday.hiddenCount).toBe(7);
    expect(tuesday.entries.map(entry => entry.title)).toEqual(["All day", "Early"]);
    expect(tuesday.summary).toContain("Job 4");
    expect(tuesday.summary).toContain("18:00 Evening");
    expect(JSON.stringify(input)).toBe(before);
  });
  it("keeps timed single-day meetings in time order", () => {
    const result = buildMobileFortnight("2026-11-23", { ...empty, calendarEvents: [event, { ...event, id: "early", title: "Early", start_time: "08:00" }] });
    expect(result[0].visibleSegments.map(segment => segment.item.title)).toEqual(["Early", "Meeting"]);
    expect(result[0].visibleSegments.map(segment => mobileRangeTime(segment, "2026-11-24"))).toEqual(["08:00", "10:00"]);
  });
  it("shows dated standalone work and tasks without inventing dates for planning jobs", () => {
    const result = buildMobileFortnight("2026-11-23", { ...empty, calendarJobs: [job("Shoot only", { due_date: null }), job("Due only", { shoot_date: null }), job("Planning", { status_label: "Planning" })], calendarTasks: [task("Asset", "12:30")] });
    expect(result[0].days[0].entries[0]).toMatchObject({ title: "Shoot only", time: "09:00" });
    expect(result[0].days[1].entries[0]).toMatchObject({ title: "Asset", time: "12:30" });
    expect(result[0].days[4].entries[0]).toMatchObject({ title: "Due only", time: "17:00" });
    expect(JSON.stringify(result)).not.toContain('"title":"Planning"');
  });
  it("keeps inbound/return itineraries as one continuous travel bar, including weekends", () => {
    const result = buildMobileFortnight("2026-11-23", { ...empty, flightEvents: [leg("outbound", "2026-11-24", "outbound"), leg("return", "2026-11-30", "return")] });
    expect(result[0].visibleSegments).toHaveLength(1);
    expect(result[0].visibleSegments[0]).toMatchObject({ startColumn: 1, span: 6, laneSpan: 1, endsAfterWeek: true });
    expect(result[0].days[5].count).toBe(1);
    expect(result[1].visibleSegments[0]).toMatchObject({ startColumn: 0, span: 1, startsBeforeWeek: true });
  });
  it("preserves the existing completed, overdue and unrelated status language", () => {
    expect(mobileScheduleTone(job("done", { is_complete: true }), "2026-11-30")).toBe("is-complete");
    expect(mobileScheduleTone(job("late"), "2026-11-30")).toBe("is-overdue");
    expect(mobileScheduleTone({ ...event, client_name: "Other client" }, "2026-11-30")).toBe("is-unrelated");
  });
});
