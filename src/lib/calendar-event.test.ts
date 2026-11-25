import { describe, expect, it } from "vitest";
import { calendarEventFormEntries, calendarEventWindowError, calendarResizeDrop, calendarTimeDrop, grabbedCalendarDay, resizedCalendarEventTime, shiftedCalendarEventDates, shiftedCalendarEventTimes } from "@/lib/calendar-event";

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

describe("moving a timed calendar event on its day", () => {
  const date = "2026-11-24";
  const event = { start_date: date, end_date: date, start_time: "09:07:20", end_time: "09:37:20.012345", is_all_day: false };
  it("snaps the beginning and preserves duration down to the stored precision", () => {
    expect(calendarTimeDrop(event, date, 19, 420, 1140)).toEqual({
      startMinute: 570, start_time: "09:30:00", end_time: "10:00:00.012345",
    });
    expect(calendarTimeDrop(event, date, -32, 420, 1140)?.start_time).toBe("08:30:00");
  });
  it("keeps the whole event inside the grid and before midnight", () => {
    expect(calendarTimeDrop(event, date, 900, 420, 1140)?.start_time).toBe("18:15:00");
    expect(calendarTimeDrop(event, date, -500, 420, 1140)?.start_time).toBe("07:00:00");
    expect(calendarTimeDrop(event, date, 900, 0, 1440)?.start_time).toBe("23:15:00");
    expect(shiftedCalendarEventTimes(event, date, 23 * 60 + 45)).toBeNull();
  });
  it("ignores horizontal/tiny motions, malformed clocks and drops on other dates", () => {
    expect(calendarTimeDrop(event, date, 3, 420, 1140)).toBeNull();
    expect(calendarTimeDrop(event, "2026-11-25", 30, 420, 1140)).toBeNull();
    expect(calendarTimeDrop({ ...event, start_time: "09:60" }, date, 30, 420, 1140)).toBeNull();
  });
});

describe("resizing one edge of a timed calendar event", () => {
  const date = "2026-11-24";
  const event = { start_date: date, end_date: date, start_time: "09:00:00.125", end_time: "11:00:00.25", is_all_day: false };
  it("snaps the moved boundary and leaves the other boundary exact", () => {
    expect(calendarResizeDrop(event, date, "start", -28, 480, 1080)).toMatchObject({ minute: 510, startTime: "08:30:00", endTime: "11:00:00.250000" });
    expect(calendarResizeDrop(event, date, "end", 31, 480, 1080)).toMatchObject({ minute: 690, startTime: "09:00:00.125000", endTime: "11:30:00" });
  });
  it("clamps contraction to at least 15 minutes and stops before midnight", () => {
    const exact = { ...event, start_time: "09:00:00", end_time: "11:00:00" };
    expect(calendarResizeDrop(exact, date, "start", 180, 480, 1080)?.startTime).toBe("10:45:00");
    expect(calendarResizeDrop(exact, date, "end", -180, 480, 1080)?.endTime).toBe("09:15:00");
    expect(calendarResizeDrop(exact, date, "end", 960, 0, 1440)?.endTime).toBe("23:45:00");
    expect(resizedCalendarEventTime(exact, date, "end", 1440)).toBeNull();
    expect(resizedCalendarEventTime(exact, date, "start", 660)).toBeNull();
  });
  it("ignores small movements, foreign dates and contractions of already short events", () => {
    expect(calendarResizeDrop(event, date, "end", 3, 480, 1080)).toBeNull();
    expect(calendarResizeDrop(event, "2026-11-25", "end", 30, 480, 1080)).toBeNull();
    expect(calendarResizeDrop({ ...event, start_time: "10:55:00" }, date, "start", 30, 480, 1080)).toBeNull();
  });
});
