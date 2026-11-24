import { describe, expect, it } from "vitest";
import { adjacentMobileCalendarAnchor, mobileCalendarDates } from "./mobile-calendar-period";

describe("mobile weekday calendar periods", () => {
  it("moves Friday → Monday → Friday and opens on Monday from a weekend", () => {
    expect(mobileCalendarDates("2026-11-28", "day")).toEqual(["2026-11-30"]);
    expect(adjacentMobileCalendarAnchor("2026-11-27", "day", 1)).toBe("2026-11-30");
    expect(adjacentMobileCalendarAnchor("2026-11-30", "day", -1)).toBe("2026-11-27");
  });
  it("moves List by ten weekdays without leaving gaps", () => {
    const anchor = "2026-11-25";
    const dates = mobileCalendarDates(anchor, "list");
    expect(dates).toHaveLength(10);
    expect(dates.at(-1)).toBe("2026-12-08");
    const next = adjacentMobileCalendarAnchor(anchor, "list", 1);
    expect(next).toBe("2026-12-09");
    expect(adjacentMobileCalendarAnchor(next, "list", -1)).toBe(anchor);
  });
  it("keeps month navigation and removes all-outside rows hidden by weekends", () => {
    const next = adjacentMobileCalendarAnchor("2026-01-30", "month", 1);
    expect(next).toBe("2026-02-02");
    const dates = mobileCalendarDates(next, "month");
    expect(dates).toHaveLength(20);
    expect(dates.at(-1)).toBe("2026-02-27");
    expect(mobileCalendarDates("2026-02-28", "month")).toEqual(dates);
  });
});
