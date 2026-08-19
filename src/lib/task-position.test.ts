import { describe, expect, it } from "vitest";
import { nextTaskPosition, TASK_POSITION_MAX } from "./task-position";

describe("nextTaskPosition", () => {
  it("starts an empty pipeline stage at 1000", () => {
    expect(nextTaskPosition(null)).toBe(1_000);
  });

  it("places a task after the highest task in a stage", () => {
    expect(nextTaskPosition("87000.000000")).toBe(88_000);
  });

  it("rejects positions that would exceed the database column", () => {
    expect(() => nextTaskPosition(TASK_POSITION_MAX)).toThrow(/normalised/);
  });
});
