import { describe, expect, it } from "vitest";
import {
  BRISBANE_TIMEZONE,
  brisbaneOccurrence,
  buildCalendarReminderPushMessage,
  formatBrisbaneDate,
  getDueCalendarReminders,
  type CalendarReminderEvent,
  type CalendarReminderSettings,
} from "@/lib/calendar-reminder-logic";

const settings: CalendarReminderSettings = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  enabled: true,
  default_event_time: "09:00:00",
  lead_minutes: 120,
  send_at_event_time: true,
  notify_job_starts: true,
  notify_job_deadlines: true,
  notify_task_deadlines: true,
  notify_campaign_assets: true,
  notify_flights: true,
  flight_lead_minutes: 180,
  timezone: BRISBANE_TIMEZONE,
};

const event: CalendarReminderEvent = {
  workspaceId: settings.workspace_id,
  entityId: "22222222-2222-4222-8222-222222222222",
  kind: "job_start",
  title: "North Lakes launch shoot",
  date: "2026-09-14",
  time: "09:00:00",
  context: "Ravish Media",
};

describe("calendar reminder timing", () => {
  it("turns Brisbane calendar values into their UTC occurrence", () => {
    expect(brisbaneOccurrence("2026-09-14", "09:00:00")?.toISOString()).toBe("2026-09-13T23:00:00.000Z");
    expect(formatBrisbaneDate(new Date("2026-09-13T23:00:00.000Z"))).toBe("2026-09-14");
  });

  it("selects both the lead and at-time reminder inside their delivery windows", () => {
    const lead = getDueCalendarReminders({ events: [event], settings, now: new Date("2026-09-13T21:00:00.000Z") });
    const atTime = getDueCalendarReminders({ events: [event], settings, now: new Date("2026-09-13T23:00:00.000Z") });
    expect(lead.map((reminder) => reminder.offsetMinutes)).toEqual([120]);
    expect(atTime.map((reminder) => reminder.offsetMinutes)).toEqual([0]);
  });

  it("uses the configured default time for date-only work", () => {
    const [reminder] = getDueCalendarReminders({
      events: [{ ...event, time: null, kind: "task_due" }],
      settings,
      now: new Date("2026-09-13T21:00:00.000Z"),
    });
    expect(reminder.occurrenceAt.toISOString()).toBe("2026-09-13T23:00:00.000Z");
  });

  it("builds a direct, deduplicated calendar notification", () => {
    const [reminder] = getDueCalendarReminders({ events: [event], settings, now: new Date("2026-09-13T21:00:00.000Z") });
    const message = buildCalendarReminderPushMessage(reminder);
    expect(message.title).toBe("Production in 2 hours");
    expect(message.body).toContain("North Lakes launch shoot · Ravish Media · 9:00 am");
    expect(message.url).toContain("/admin/calendar?");
    expect(message.tag).toContain(event.entityId);
  });

  it("uses an event's own reminder choices instead of the workspace defaults", () => {
    const calendarEvent: CalendarReminderEvent = {
      ...event,
      kind: "calendar_event_start",
      reminderOffsetsMinutes: [60, 0],
    };
    const due = getDueCalendarReminders({
      events: [calendarEvent],
      settings,
      now: new Date("2026-09-13T22:00:00.000Z"),
    });
    expect(due.map((reminder) => reminder.offsetMinutes)).toEqual([60]);
    expect(buildCalendarReminderPushMessage(due[0]).title).toBe("Calendar event in 1 hour");
  });

  it("does not schedule an event when no reminders were selected", () => {
    expect(getDueCalendarReminders({
      events: [{ ...event, kind: "calendar_event_start", reminderOffsetsMinutes: [] }],
      settings,
      now: new Date("2026-09-13T23:00:00.000Z"),
    })).toEqual([]);
  });

  it("builds a structured three-hour flight briefing", () => {
    const flight: CalendarReminderEvent = {
      workspaceId: settings.workspace_id,
      entityId: "33333333-3333-4333-8333-333333333333",
      kind: "flight_departure",
      title: "Sydney production trip",
      date: "2026-09-14",
      time: "09:00:00",
      context: "Brisbane · BNE → Sydney · SYD",
      reminderOffsetsMinutes: [180],
      flightDetails: {
        airline: "Qantas",
        flightNumber: "QF 501",
        route: "Brisbane · BNE → Sydney · SYD",
        localTime: "9am",
        terminal: "Domestic 3",
        travelClass: "Economy",
        seatNumber: "14A",
        onwardDetails: null,
      },
    };
    const [reminder] = getDueCalendarReminders({ events: [flight], settings, now: new Date("2026-09-13T20:00:00.000Z") });
    const message = buildCalendarReminderPushMessage(reminder);

    expect(message.title).toBe("Flight departure in 3 hours");
    expect(message.body).toContain("Qantas QF 501 · Brisbane · BNE → Sydney · SYD · 9am");
    expect(message.body).toContain("Terminal Domestic 3 · Economy · Seat 14A");
    expect(message.kind).toBe("flight");
    expect(message.url).toContain("/autopacific?view=calendar&flight=");
  });

  it("includes onward details in the arrival briefing", () => {
    const flight: CalendarReminderEvent = {
      workspaceId: settings.workspace_id,
      entityId: "44444444-4444-4444-8444-444444444444",
      kind: "flight_arrival",
      title: "Sydney production trip",
      date: "2026-09-14",
      time: "12:00:00",
      context: "Brisbane · BNE → Sydney · SYD",
      reminderOffsetsMinutes: [180],
      flightDetails: {
        airline: "Qantas",
        flightNumber: "QF 501",
        route: "Brisbane · BNE → Sydney · SYD",
        localTime: "12pm",
        terminal: "Terminal 3",
        travelClass: "Economy",
        seatNumber: "14A",
        onwardDetails: "Stay: The Old Clare · Chippendale · Vehicle: Avis · Terminal pickup",
      },
    };
    const [reminder] = getDueCalendarReminders({ events: [flight], settings, now: new Date("2026-09-13T23:00:00.000Z") });
    const message = buildCalendarReminderPushMessage(reminder);

    expect(message.title).toBe("Flight arrival in 3 hours");
    expect(message.body).toContain("Terminal 3 · Economy · Seat 14A");
    expect(message.body).toContain("Stay: The Old Clare · Chippendale · Vehicle: Avis · Terminal pickup");
  });
});
