import { describe, expect, it } from "vitest";
import { calendarViewStorageKey, mobileCalendarModes, parseCalendarViewMemory } from "./calendar-view-memory";

describe("local calendar view preferences", () => {
  const today = "2026-11-10";
  const saved = { version: 1, mode: "hybrid", date: "2026-12-02", anchor: "2026-11-30", viewedOn: today };
  it("restores a valid view without retaining calendar record data", () => {
    expect(parseCalendarViewMemory(JSON.stringify({ ...saved, jobs: ["private"] }), today, "fortnight"))
      .toEqual({ mode: "hybrid", date: "2026-12-02", anchor: "2026-11-30" });
  });
  it("falls back from legacy mobile Hybrid to Fortnight without discarding active preferences", () => {
    expect(parseCalendarViewMemory(JSON.stringify(saved), today, "fortnight", mobileCalendarModes))
      .toEqual({ mode: "fortnight", date: today, anchor: today });
    expect(parseCalendarViewMemory(JSON.stringify({ ...saved, mode: "month" }), today, "fortnight", mobileCalendarModes))
      .toMatchObject({ mode: "month", anchor: saved.anchor });
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
  it.each(["2026-11-11", "2026-11-17"])("keeps the preferred view but resets dates on a later day (%s)", nextDay => {
    expect(parseCalendarViewMemory(JSON.stringify(saved), nextDay, "fortnight"))
      .toEqual({ mode: "hybrid", date: nextDay, anchor: nextDay });
  });
  it("moves undated legacy preferences to today without discarding the view choice", () => {
    expect(parseCalendarViewMemory(JSON.stringify({ version: 1, mode: "day", date: "2026-10-01", anchor: "2026-10-01" }), today, "fortnight"))
      .toEqual({ mode: "day", date: today, anchor: today });
  });
});
