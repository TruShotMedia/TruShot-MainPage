import { describe, expect, it } from "vitest";
import { buildRecurringIngreignMarkers, firstFriday, replaceIngreignCaptionTokens } from "./ingreign";

describe("INGREIGN recurring calendar", () => {
  it("finds the first Friday of a month", () => {
    expect(firstFriday(2026, 9)).toBe("2026-10-02");
    expect(firstFriday(2027, 2)).toBe("2027-03-05");
  });

  it("creates six posting markers for March through December", () => {
    const markers = buildRecurringIngreignMarkers(2026);
    expect(markers).toHaveLength(60);
    const threeDayMarker = markers.find((marker) => marker.id === "recurring-2026-10-02-three_days");
    expect(threeDayMarker?.date).toBe("2026-09-29");
    expect(threeDayMarker?.eventDate).toBe("2026-10-02");
    expect(threeDayMarker?.monthLabel).toBe("October");
    expect(threeDayMarker?.dayLabel).toBe("02");
    expect(markers.find((marker) => marker.id === "recurring-2026-10-02-event_day")?.calendarLabel).toBe("INGREIGN EVENT");
  });

  it("uses the target event date on artwork opened from an earlier posting marker", () => {
    const marker = buildRecurringIngreignMarkers(2026).find((item) => item.id === "recurring-2026-11-06-date_post");
    expect(marker).toMatchObject({
      date: "2026-10-23",
      eventDate: "2026-11-06",
      monthLabel: "November",
      dayLabel: "06",
    });
  });

  it("expands editable caption date tokens", () => {
    const marker = buildRecurringIngreignMarkers(2026).find((item) => item.id === "recurring-2026-10-02-three_days")!;
    expect(replaceIngreignCaptionTokens("{{MONTH}} {{DAY}} · {{EVENT_MONTH}} {{EVENT_DAY}}", marker)).toBe("October 02 · October 02");
  });
});

