import { describe, expect, it } from "vitest";
import { calendarEventFormEntries, calendarEventWindowError, grabbedCalendarDay, shiftedCalendarEventDates } from "@/lib/calendar-event";

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

describe("moving a calendar event by whole days", () => {
  it("keeps single-day bookings single day", () => {
    expect(shiftedCalendarEventDates("2026-11-24", "2026-11-24", "2026-11-24", "2026-11-27"))
      .toEqual({ start_date: "2026-11-27", end_date: "2026-11-27" });
  });
  it("moves a grabbed date inside the event and preserves its span across month and year boundaries", () => {
    expect(shiftedCalendarEventDates("2026-12-28", "2027-01-02", "2027-01-01", "2027-01-04"))
      .toEqual({ start_date: "2026-12-31", end_date: "2027-01-05" });
    expect(shiftedCalendarEventDates("2026-10-03", "2026-10-04", "2026-10-04", "2026-10-02"))
      .toEqual({ start_date: "2026-10-01", end_date: "2026-10-02" });
  });
  it("rejects source dates outside the booking", () => {
    expect(shiftedCalendarEventDates("2026-11-24", "2026-11-25", "2026-11-23", "2026-11-27")).toBeNull();
  });
  it("uses the displayed day under the pointer in a range bar, including the last edge", () => {
    const days = ["2026-11-24", "2026-11-25", "2026-11-26"];
    expect(grabbedCalendarDay(days, 40, 300, 156)).toBe(days[1]);
    expect(grabbedCalendarDay(days, 40, 300, 340)).toBe(days[2]);
  });
});
