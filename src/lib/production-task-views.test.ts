import { describe, expect, it } from "vitest";
import { mergeProductionRecords, productionTaskView, tasksForProductionView } from "./production-task-views";
import type { PipelineTask, TaskStatus } from "./types";
const statuses: TaskStatus[] = ["not_started", "in_progress", "posted_done", "delayed"].map((key, position) => ({ id: key, key, label: key, color: "#579", position, is_open: position < 2 }));
const task = (id: string, status_id: string, shoot_date = "2026-10-28"): PipelineTask => ({ id, title: id, status_id, job_id: "job", job: { title: "Launch job", shoot_date }, asset_type: "Asset", hours: null, due_date: null, due_time: null, priority: "normal", description: null, position: 1, updated_at: "2026-10-28T00:00:00Z", completed_at: null });
describe("task workspace views", () => {
  it("separates planning, active and completed without calling delayed work delivered", () => {
    const tasks = statuses.map(status => task(status.key, status.id));
    expect(tasksForProductionView(tasks, statuses, "planning").map(task => task.id)).toEqual(["not_started"]);
    expect(tasksForProductionView(tasks, statuses, "active").map(task => task.id)).toEqual(["in_progress"]);
    expect(tasksForProductionView(tasks, statuses, "completed").map(task => task.id)).toEqual(["posted_done"]);
    expect(productionTaskView(undefined)).toBeNull();
  });
  it("sorts by latest shoot date and searches both task and related job", () => {
    const tasks = [task("older", "in_progress", "2026-10-20"), task("newer", "in_progress")];
    expect(tasksForProductionView(tasks, statuses, "active", " launch ").map(task => task.id)).toEqual(["newer", "older"]);
  });
  it("keeps the legacy Ready To Post stage in active review", () => {
    expect(productionTaskView({ ...statuses[2], key: "ready_to_post" })).toBe("active");
  });
  it("retains records from other views when a filtered board changes", () => {
    const existing = [task("planning", "not_started"), task("active", "in_progress"), task("done", "posted_done")];
    const changed = mergeProductionRecords(existing, [{ ...existing[1], status_id: "posted_done" }]);
    expect(changed).toHaveLength(3);
    expect(changed[0]).toBe(existing[0]);
    expect(changed[1].status_id).toBe("posted_done");
    expect(changed[2]).toBe(existing[2]);
  });
});
