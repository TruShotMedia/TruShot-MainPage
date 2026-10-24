import { describe, expect, it } from "vitest";
import { buildLifestyleSchedule } from "@/lib/lifestyle-schedule";
import { getLifestyleProgram, lifestyleNotificationLine, preferredDaysForFrequency } from "@/lib/lifestyle";

describe("Lifestyle program", () => {
  it("builds the preferred lower, upper and full-body three-session week", () => {
    const program = getLifestyleProgram(3, "upper_lower");
    expect(program.map((workout) => workout.key)).toEqual(["lower_a", "upper_a", "full_b"]);
    expect(program.flatMap((workout) => workout.exercises).map((exercise) => exercise.pattern)).toEqual(
      expect.arrayContaining(["squat", "bridge", "push", "pull", "core", "single_leg", "hinge"]),
    );
  });

  it("keeps focused upper and lower sessions separate on four days", () => {
    expect(getLifestyleProgram(4, "upper_lower").map((workout) => workout.key)).toEqual([
      "lower_a",
      "upper_a",
      "lower_b",
      "upper_b",
    ]);
  });

  it("cycles full-body sessions when that style is selected", () => {
    expect(getLifestyleProgram(5, "full_body").map((workout) => workout.key)).toEqual(["full_a", "full_b", "full_c"]);
  });

  it("keeps playful reminder selection deterministic", () => {
    expect(lifestyleNotificationLine("session-123")).toBe(lifestyleNotificationLine("session-123"));
  });

  it("selects a different time when an event overlaps the preference", () => {
    const schedule = buildLifestyleSchedule({
      startDate: "2026-10-26",
      weeks: 1,
      daysPerWeek: 3,
      preferredDays: preferredDaysForFrequency(3),
      preferredStartTime: "17:30",
      durationMinutes: 60,
      program: getLifestyleProgram(3, "upper_lower"),
      busyWindows: [{ date: "2026-10-26", startTime: "17:00", endTime: "19:00", allDay: false, label: "Existing event" }],
    });
    expect(schedule).toHaveLength(3);
    const monday = schedule.find((session) => session.sessionDate === "2026-10-26");
    expect(monday?.startTime).not.toBe("17:30");
  });
});
