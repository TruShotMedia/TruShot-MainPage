import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildLifestyleReminderMessage } from "@/lib/lifestyle-reminders";

describe("Lifestyle reminders", () => {
  const session = {
    id: "session-1",
    workspace_id: "workspace-1",
    user_id: "user-1",
    session_date: "2026-10-27",
    start_time: "17:30:00",
    title: "Foundation A",
    focus: "Glutes and full-body strength",
  };

  it("uses a stable replacement tag and Lifestyle deep link", () => {
    const early = buildLifestyleReminderMessage(session, 120);
    const atTime = buildLifestyleReminderMessage(session, 0);
    expect(early.tag).toBe(atTime.tag);
    expect(early.kind).toBe("lifestyle");
    expect(early.url).toContain("/lifestyle?view=today");
    expect(early.badgeCount).toBe(1);
  });
});
