import { describe, expect, it } from "vitest";
import {
  brisbaneDateInput,
  defaultCompletedDateRange,
  isDateInCompletedRange,
} from "@/lib/completed-date-filter";

describe("completed date filters", () => {
  it("defaults to the previous three calendar months in Brisbane", () => {
    expect(defaultCompletedDateRange(new Date("2026-10-08T02:00:00.000Z"))).toEqual({
      from: "2026-07-08",
      to: "2026-10-08",
    });
  });

  it("clamps the start date when the target month is shorter", () => {
    expect(defaultCompletedDateRange(new Date("2026-05-31T02:00:00.000Z"))).toEqual({
      from: "2026-02-28",
      to: "2026-05-31",
    });
  });

  it("uses Brisbane calendar dates and inclusive boundaries", () => {
    expect(brisbaneDateInput("2026-07-07T15:00:00.000Z")).toBe("2026-07-08");
    expect(
      isDateInCompletedRange(
        "2026-07-07T15:00:00.000Z",
        "2026-07-08",
        "2026-10-08",
      ),
    ).toBe(true);
    expect(
      isDateInCompletedRange(
        "2026-07-07T13:59:59.000Z",
        "2026-07-08",
        "2026-10-08",
      ),
    ).toBe(false);
  });
});
