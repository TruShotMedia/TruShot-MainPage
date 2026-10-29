import { describe, expect, it } from "vitest";
import { compareCompletedRecords } from "./production-completed";
describe("completed records newest first", () => {
  it("uses completion, not when an old completed item was edited", () => {
    const records = [{ title: "Older", completed_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-30T10:00:00Z" },
      { title: "Latest", completed_at: "2026-10-29T10:00:00Z", updated_at: "2026-10-29T10:00:00Z" }];
    expect([...records].sort(compareCompletedRecords).map(item => item.title)).toEqual(["Latest", "Older"]);
  });
  it("handles timezone offsets and missing legacy delivery dates", () => {
    const records = [{ title: "Delivered", delivered_at: "2026-10-29T23:00:00+10:00", updated_at: "2026-10-30T10:00:00Z" },
      { title: "Legacy", updated_at: "2026-10-29T14:00:00Z" }, { title: "Invalid", delivered_at: "bad-date", updated_at: "" }];
    expect(records.sort(compareCompletedRecords).map(item => item.title)).toEqual(["Legacy", "Delivered", "Invalid"]);
  });
});
