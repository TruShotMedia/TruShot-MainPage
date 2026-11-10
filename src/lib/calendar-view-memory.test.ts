import { describe, expect, it } from "vitest";
import { calendarViewStorageKey, parseCalendarViewMemory } from "./calendar-view-memory";

describe("local calendar view preferences", () => {
  const today = "2026-11-10";
  const saved = { version: 1, mode: "hybrid", date: "2026-12-02", anchor: "2026-11-30" };
  it("restores a valid view without retaining calendar record data", () => {
    expect(parseCalendarViewMemory(JSON.stringify({ ...saved, jobs: ["private"] }), today, "fortnight"))
      .toEqual({ mode: "hybrid", date: "2026-12-02", anchor: "2026-11-30" });
  });
  it.each([null, "{", "null", "[]", JSON.stringify({ ...saved, version: 2 }), JSON.stringify({ ...saved, mode: "unknown" }),
    JSON.stringify({ ...saved, date: "2026-02-31" }), JSON.stringify({ ...saved, anchor: "bad" }), "x".repeat(513)])("ignores invalid/outdated storage: %s", raw => {
    expect(parseCalendarViewMemory(raw, today, "week")).toEqual({ mode: "week", date: today, anchor: today });
  });
  it("separates users, pages, workspaces and screen layouts", () => {
    const key = calendarViewStorageKey("autopacific", "john", "mine", false);
    expect(new Set([key, calendarViewStorageKey("marketing", "john", "mine", false),
      calendarViewStorageKey("autopacific", "other", "mine", false), calendarViewStorageKey("autopacific", "john", "team", false),
      calendarViewStorageKey("autopacific", "john", "mine", true)]).size).toBe(5);
  });
});
