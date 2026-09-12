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
});
