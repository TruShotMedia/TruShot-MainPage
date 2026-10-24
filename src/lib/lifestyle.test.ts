import { describe, expect, it } from "vitest";
import { buildLifestyleSchedule } from "@/lib/lifestyle-schedule";
import { getLifestyleProgram, lifestyleNotificationLine, preferredDaysForFrequency } from "@/lib/lifestyle";

describe("Lifestyle program", () => {
  it("builds a balanced three-session week", () => {
    const program = getLifestyleProgram(3);
    expect(program).toHaveLength(3);
    expect(program.flatMap((workout) => workout.exercises).map((exercise) => exercise.pattern)).toEqual(
      expect.arrayContaining(["squat", "bridge", "push", "pull", "core", "single_leg", "hinge", "carry"]),
    );
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
      program: getLifestyleProgram(3),
      busyWindows: [{ date: "2026-10-26", startTime: "17:00", endTime: "19:00", allDay: false, label: "Existing event" }],
    });
    expect(schedule).toHaveLength(3);
    const monday = schedule.find((session) => session.sessionDate === "2026-10-26");
    expect(monday?.startTime).not.toBe("17:30");
  });
});
