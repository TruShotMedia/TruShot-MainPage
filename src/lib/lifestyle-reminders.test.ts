import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildLifestyleWellnessReminderMessage,
  dueLifestyleWellnessReminders,
  lifestyleHydrationReminderTimes,
  type LifestyleReminderProfile,
} from "@/lib/lifestyle-reminders";
import { LIFESTYLE_NOTIFICATION_LINES } from "@/lib/lifestyle";

const profile: LifestyleReminderProfile = {
  id: "profile-john",
  workspace_id: "workspace-1",
  user_id: "user-1",
  display_name: "John",
  preferred_start_time: "17:30:00",
  daily_gym_reminder_enabled: true,
  hydration_reminders_enabled: true,
};

function brisbaneOccurrence(date: string, time: string, minutesAfter = 5) {
  return new Date(new Date(`${date}T${time}:00+10:00`).getTime() + minutesAfter * 60_000);
}

function minutesSinceMidnight(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

describe("Lifestyle wellness reminders", () => {
  it("uses one replacement tag for gym and hydration notifications", () => {
    const occurrence = new Date("2026-10-24T07:30:00.000Z");
    const gym = buildLifestyleWellnessReminderMessage(profile, "2026-10-24", "gym", occurrence);
    const hydration = buildLifestyleWellnessReminderMessage(
      profile,
      "2026-10-24",
      "hydration-morning",
      occurrence,
    );

    expect(gym.tag).toBe("lifestyle-daily-care");
    expect(hydration.tag).toBe(gym.tag);
    expect(gym.kind).toBe("lifestyle");
    expect(gym.url).toBe("/lifestyle?view=today");
    expect(hydration.badgeCount).toBe(1);
  });

  it("uses the corrected pookie spelling in rotating gym copy", () => {
    expect(LIFESTYLE_NOTIFICATION_LINES.some((line) => line.includes("pookie"))).toBe(true);
    expect(LIFESTYLE_NOTIFICATION_LINES.every((line) => !line.includes("pooky"))).toBe(true);
  });

  it("chooses deterministic varied hydration times inside sensible daytime windows", () => {
    const first = lifestyleHydrationReminderTimes(profile.id, "2026-10-24");
    const repeated = lifestyleHydrationReminderTimes(profile.id, "2026-10-24");
    const nextDay = lifestyleHydrationReminderTimes(profile.id, "2026-10-25");

    expect(repeated).toEqual(first);
    expect(nextDay).not.toEqual(first);
    expect(minutesSinceMidnight(first["hydration-morning"])).toBeGreaterThanOrEqual(9 * 60 + 30);
    expect(minutesSinceMidnight(first["hydration-morning"])).toBeLessThanOrEqual(11 * 60 + 30);
    expect(minutesSinceMidnight(first["hydration-afternoon"])).toBeGreaterThanOrEqual(13 * 60 + 30);
    expect(minutesSinceMidnight(first["hydration-afternoon"])).toBeLessThanOrEqual(15 * 60 + 30);
  });

  it("schedules the gym nudge every day without needing a workout session", () => {
    const due = dueLifestyleWellnessReminders(
      [profile],
      new Date("2026-10-24T07:35:00.000Z"),
    );

    expect(due.map((reminder) => reminder.slot)).toContain("gym");
    expect(due.find((reminder) => reminder.slot === "gym")?.reminderDate).toBe("2026-10-24");
  });

  it("schedules both hydration nudges independently and respects settings", () => {
    const date = "2026-10-24";
    const times = lifestyleHydrationReminderTimes(profile.id, date);
    const hydrationOnly = { ...profile, daily_gym_reminder_enabled: false };

    const morning = dueLifestyleWellnessReminders(
      [hydrationOnly],
      brisbaneOccurrence(date, times["hydration-morning"]),
    );
    const afternoon = dueLifestyleWellnessReminders(
      [hydrationOnly],
      brisbaneOccurrence(date, times["hydration-afternoon"]),
    );
    const disabled = dueLifestyleWellnessReminders(
      [{ ...profile, daily_gym_reminder_enabled: false, hydration_reminders_enabled: false }],
      new Date("2026-10-24T07:35:00.000Z"),
    );

    expect(morning.map((reminder) => reminder.slot)).toContain("hydration-morning");
    expect(afternoon.map((reminder) => reminder.slot)).toContain("hydration-afternoon");
    expect(disabled).toEqual([]);
  });
});
