import { describe, expect, it } from "vitest";
import {
  buildClickUpCalendarEventDescription,
  buildClickUpCalendarEventPayload,
  extractClickUpCalendarEventId,
  isClickUpCalendarEventComplete,
  type ClickUpCalendarEventSnapshot,
} from "@/lib/clickup/calendar-event-mapping";

const event: ClickUpCalendarEventSnapshot = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "AutoPacific planning session",
  description: "Bring the campaign brief.",
  location: "Brisbane",
  start_date: "2026-10-23",
  start_time: "09:00:00",
  end_date: "2026-10-23",
  end_time: "10:30:00",
  is_all_day: false,
};

describe("ClickUp calendar event mapping", () => {
  it("keeps an event open until its Brisbane finish time", () => {
    expect(isClickUpCalendarEventComplete(event, new Date("2026-10-22T23:45:00.000Z"))).toBe(false);
    expect(isClickUpCalendarEventComplete(event, new Date("2026-10-23T00:30:00.000Z"))).toBe(true);
  });

  it("completes an all-day event only after its end date", () => {
    const allDay = { ...event, is_all_day: true, start_time: null, end_time: null };
    expect(isClickUpCalendarEventComplete(allDay, new Date("2026-10-23T10:00:00.000Z"))).toBe(false);
    expect(isClickUpCalendarEventComplete(allDay, new Date("2026-10-23T14:01:00.000Z"))).toBe(true);
  });

  it("builds a dated, assigned ClickUp task and preserves the CRM marker", () => {
    const payload = buildClickUpCalendarEventPayload({
      assignedUserId: 42,
      completeStatus: "COMPLETE",
      event,
      now: new Date("2026-10-22T23:00:00.000Z"),
      openStatus: "TO DO",
    });
    expect(payload).toMatchObject({
      name: event.title,
      status: "TO DO",
      assignees: [42],
      start_date_time: true,
      due_date_time: true,
    });
    const description = buildClickUpCalendarEventDescription(event);
    expect(description).toContain("AutoPacific calendar event");
    expect(description).toContain("Synced from John's CRM");
    expect(description).not.toContain("Synced from TruShot CRM");
    expect(description).toContain(event.id);
    expect(extractClickUpCalendarEventId(description)).toBe(event.id);
  });
});
