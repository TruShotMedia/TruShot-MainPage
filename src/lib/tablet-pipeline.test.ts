import { describe, expect, it } from "vitest";
import { getTabletWorkload } from "@/lib/tablet-pipeline";
import type { PipelineTask, TaskStatus } from "@/lib/types";

const statuses: TaskStatus[] = [
  { id: "11111111-1111-4111-8111-111111111111", key: "not_started", label: "Not Started", color: "#767676", position: 10, is_open: true },
  { id: "22222222-2222-4222-8222-222222222222", key: "ready_to_post", label: "Ready To Post", color: "#397253", position: 20, is_open: true },
  { id: "33333333-3333-4333-8333-333333333333", key: "posted_done", label: "Posted / Done", color: "#777773", position: 30, is_open: false },
];

function task(id: string, statusId: string, dueDate: string | null): PipelineTask {
  return {
    id,
    title: `Asset ${id.slice(0, 1)}`,
    job_id: "44444444-4444-4444-8444-444444444444",
    status_id: statusId,
    asset_type: "video",
    hours: 1,
    due_date: dueDate,
    priority: "normal",
    description: null,
    position: 10,
    updated_at: "2026-08-25T00:00:00.000Z",
  };
}

describe("getTabletWorkload", () => {
  it("counts only active pipeline assets and separates overdue from the next seven days", () => {
    const tasks = [
      task("a1111111-1111-4111-8111-111111111111", statuses[0].id, "2026-08-24"),
      task("b2222222-2222-4222-8222-222222222222", statuses[1].id, "2026-08-25"),
      task("c3333333-3333-4333-8333-333333333333", statuses[0].id, "2026-09-01"),
      task("d4444444-4444-4444-8444-444444444444", statuses[0].id, "2026-09-02"),
      task("e5555555-5555-4555-8555-555555555555", statuses[2].id, "2026-08-24"),
    ];

    expect(getTabletWorkload(tasks, statuses, "2026-08-25")).toEqual({
      active: 4,
      overdue: 1,
      upcoming: 2,
    });
  });
});
