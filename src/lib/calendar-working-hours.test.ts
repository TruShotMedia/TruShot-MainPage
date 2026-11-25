import { expect, it } from "vitest";
import { videographerWorkingHours, workingHoursTime } from "./calendar-working-hours";

it.each(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"])("uses the regular hours on %s", date => {
  expect(videographerWorkingHours(date)).toEqual({ start: 420, end: 975 });
});

it("uses the shorter Friday window and no weekend window", () => {
  expect(videographerWorkingHours("2026-11-27")).toEqual({ start: 420, end: 735 });
  expect(videographerWorkingHours("2026-11-28")).toBeNull();
  expect(videographerWorkingHours("2026-11-29")).toBeNull();
  expect([420, 735, 975].map(workingHoursTime)).toEqual(["7:00 AM", "12:15 PM", "4:15 PM"]);
});
