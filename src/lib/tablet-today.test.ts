import { describe, expect, it } from "vitest";
import { buildTabletTodayAgenda } from "@/lib/tablet-today";

describe("buildTabletTodayAgenda", () => {
  it("builds a focused day plan without treating future long-lead work as today's work", () => {
    const agenda = buildTabletTodayAgenda({
      today: "2026-10-16",
      accentClientName: "Autopacific Group",
      accentKeywords: ["autopacific", "autopac"],
      jobs: [
        { id: "shoot", entity_type: "job", title: "APG shoot", client_name: "Autopacific Group", shoot_date: "2026-10-16", shoot_time: "09:00", due_date: "2026-10-20", due_time: null, status_label: "Not started", status_color: "#5d91b0", is_complete: false },
        { id: "long", entity_type: "job", title: "Long lead", client_name: "Autopacific Group", shoot_date: "2026-10-15", shoot_time: null, due_date: "2027-03-01", due_time: null, status_label: "Not started", status_color: "#5d91b0", is_complete: false },
        { id: "due", entity_type: "job", title: "Delivery", client_name: "Autopacific Group", shoot_date: "2026-10-10", shoot_time: null, due_date: "2026-10-16", due_time: "17:00", status_label: "In progress", status_color: "#5d91b0", is_complete: false },
      ],
      tasks: [
        { id: "late", entity_type: "task", title: "Late edit", job_title: "Launch", client_name: "Autopacific Group", due_date: "2026-10-15", due_time: null, priority: "high", status_label: "In progress", status_color: "#5d91b0", is_complete: false },
        { id: "working", entity_type: "task", title: "Active cut", job_title: "Launch", client_name: "Autopacific Group", due_date: "2026-10-20", due_time: null, priority: "normal", status_label: "Ready For Revision", status_color: "#5d91b0", is_complete: false },
        { id: "done", entity_type: "task", title: "Finished", job_title: "Launch", client_name: "Autopacific Group", due_date: "2026-10-16", due_time: null, priority: "normal", status_label: "Posted / Done", status_color: "#777", is_complete: true },
      ],
      customEvents: [{ id: "meeting", entity_type: "calendar-event", client_id: "client-ap", client_name: "Autopacific Group", title: "Autopac review", description: null, location: "Boardroom", start_date: "2026-10-16", start_time: "11:00", end_date: "2026-10-16", end_time: "12:00", is_all_day: false, color: "#5d91b0", reminder_offsets_minutes: [], created_at: "2026-10-01", updated_at: "2026-10-01" }],
      flightEvents: [],
    });

    expect(agenda.schedule.map((item) => item.id)).toEqual(["job:shoot", "event:meeting"]);
    expect(agenda.priority.map((item) => item.id)).toEqual(["task:late", "job:due"]);
    expect(agenda.inProgress.map((item) => item.id)).toEqual(["task:working"]);
    expect([...agenda.schedule, ...agenda.priority, ...agenda.inProgress].some((item) => item.id === "job:long")).toBe(false);
    expect(agenda.counts).toMatchObject({ scheduled: 2, dueToday: 1, overdue: 1, inProgress: 1 });
  });

  it("includes multi-day calendar and flight entries that overlap today", () => {
    const agenda = buildTabletTodayAgenda({
      today: "2026-10-16",
      jobs: [],
      tasks: [],
      customEvents: [{ id: "event", entity_type: "calendar-event", client_id: null, client_name: null, title: "Conference", description: null, location: "Brisbane", start_date: "2026-10-15", start_time: "09:00", end_date: "2026-10-17", end_time: "17:00", is_all_day: false, color: "#777", reminder_offsets_minutes: [], created_at: "2026-10-01", updated_at: "2026-10-01" }],
      flightEvents: [{ id: "flight", entity_type: "flight-event", client_id: null, client_name: null, travel_plan_id: null, leg_order: 1, leg_kind: "outbound", title: "Sydney trip", departure_date: "2026-10-16", departure_time: "07:30", arrival_date: "2026-10-16", arrival_time: "09:00", origin_location: "BNE", destination_location: "SYD", departure_airline: "Qantas", arrival_airline: "Qantas", departure_airline_code: "QF", arrival_airline_code: "QF", departure_flight_number: "QF501", arrival_flight_number: "QF501", departure_terminal: "D", arrival_terminal: "3", travel_class: "Economy", seat_number: "12A", notes: null, accommodation_title: null, accommodation_location: null, accommodation_notes: null, vehicle_title: null, vehicle_location: null, vehicle_notes: null, color: "#5d91b0", created_at: "2026-10-01", updated_at: "2026-10-01" }],
    });

    expect(agenda.schedule.map((item) => item.id)).toEqual(["event:event", "flight:flight"]);
    expect(agenda.schedule.find((item) => item.id === "flight:flight")?.time).toBe("7:30am");
  });
});
