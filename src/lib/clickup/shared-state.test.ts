import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let sharedState: typeof import("@/lib/clickup/shared-state");

beforeAll(async () => {
  sharedState = await import("@/lib/clickup/shared-state");
});

describe("ClickUp shared job state", () => {
  it("normalises CRM values before hashing", () => {
    const first = sharedState.sharedStateFromCrm({
      title: "  Launch film  ",
      shoot_date: "2026-10-23",
      shoot_time: "09:15:00",
      due_date: "2026-10-25",
      due_time: null,
    }, "editing");
    const second = sharedState.sharedStateFromCrm({
      title: "Launch film",
      shoot_date: "2026-10-23",
      shoot_time: "09:15",
      due_date: "2026-10-25",
      due_time: null,
    }, "EDITING");
    expect(first).toEqual(second);
    expect(sharedState.sharedStateHash(first)).toBe(sharedState.sharedStateHash(second));
  });

  it("converts ClickUp Brisbane timestamps into CRM dates and times", () => {
    const result = sharedState.sharedStateFromClickUp({
      id: "task-1",
      name: "Launch film",
      status: { status: "EDITING" },
      start_date: String(Date.parse("2026-10-23T09:15:00+10:00")),
      start_date_time: true,
      due_date: String(Date.parse("2026-10-25T04:00:00+10:00")),
      due_date_time: false,
    });
    expect(result).toEqual({
      title: "Launch film",
      status: "EDITING",
      shoot_date: "2026-10-23",
      shoot_time: "09:15",
      due_date: "2026-10-25",
      due_time: null,
    });
  });

  it("reports only the shared fields that changed", () => {
    const left = {
      title: "Launch film",
      status: "EDITING",
      shoot_date: "2026-10-23",
      shoot_time: "09:15",
      due_date: "2026-10-25",
      due_time: null,
    };
    expect(sharedState.changedSharedFields(left, { ...left, title: "Launch reel", status: "APPROVAL" }))
      .toEqual(["title", "status"]);
  });
});
