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
    expect(markers.find((marker) => marker.id === "recurring-2026-10-02-three_days")?.date).toBe("2026-09-29");
    expect(markers.find((marker) => marker.id === "recurring-2026-10-02-event_day")?.calendarLabel).toBe("INGREIGN EVENT");
  });

  it("expands editable caption date tokens", () => {
    const marker = buildRecurringIngreignMarkers(2026).find((item) => item.id === "recurring-2026-10-02-three_days")!;
    expect(replaceIngreignCaptionTokens("{{MONTH}} {{DAY}} · {{EVENT_MONTH}} {{EVENT_DAY}}", marker)).toBe("September 29 · October 02");
  });
});

