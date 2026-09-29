import { describe, expect, it } from "vitest";
import { calendarEventFormEntries, calendarEventWindowError } from "@/lib/calendar-event";

describe("calendar event windows", () => {
  it("normalizes the hidden time fields for an all-day event", () => {
    const formData = new FormData();
    formData.set("title", "All-day shoot");

    expect(calendarEventFormEntries(formData)).toMatchObject({
      title: "All-day shoot",
      start_time: "",
      end_time: "",
    });
  });

  it("rejects an end date before the start date", () => {
    expect(calendarEventWindowError({
      startDate: "2026-10-12",
      startTime: "",
      endDate: "2026-09-29",
      endTime: "",
      isAllDay: true,
    })).toBe("The event cannot finish before it starts.");
  });

  it("rejects a timed event that finishes before it starts on the same day", () => {
    expect(calendarEventWindowError({
      startDate: "2026-10-12",
      startTime: "14:00",
      endDate: "2026-10-12",
      endTime: "13:00",
      isAllDay: false,
    })).toBe("The event must finish after its start time.");
  });

  it("accepts valid all-day and overnight events", () => {
    expect(calendarEventWindowError({
      startDate: "2026-10-12",
      startTime: "",
      endDate: "2026-10-12",
      endTime: "",
      isAllDay: true,
    })).toBeNull();
    expect(calendarEventWindowError({
      startDate: "2026-10-12",
      startTime: "23:00",
      endDate: "2026-10-13",
      endTime: "01:00",
      isAllDay: false,
    })).toBeNull();
  });
});
