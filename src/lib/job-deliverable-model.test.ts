import { describe, expect, it } from "vitest";
import { getJobDeliverables, getJobDeliverableRows, type JobLinkedTask } from "./job-deliverable-model";

const task = (id: string, source_deliverable_id: string | null = null): JobLinkedTask => ({ id, title: `Output ${id}`, due_date: "2026-11-13", source_deliverable_id, is_complete: false, status_label: "In Progress" });
describe("job deliverables read model", () => {
  it("includes all five separately attached tasks when the planned list is empty", () => {
    const job = { deliverables: [], linked_tasks: Array.from({ length: 5 }, (_, i) => task(String(i))) };
    expect(getJobDeliverableRows(job)).toHaveLength(5);
    expect(getJobDeliverableRows(job).map(item => item.task_id)).toEqual(["0", "1", "2", "3", "4"]);
    expect(getJobDeliverables(job)).toEqual([]);
  });
  it("shows a generated task once, with its current title, deadline and completion", () => {
    const job = { deliverables: [{ id: "planned", name: "Old title", date: null }], linked_tasks: [{ ...task("generated", "planned"), title: "Renamed reel", is_complete: true }, task("manual")] };
    const rows = getJobDeliverableRows(job);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "planned", name: "Renamed reel", date: "2026-11-13", task_id: "generated", is_complete: true });
    expect(job.deliverables[0].name).toBe("Old title");
  });
  it("does not collapse distinct same-name tasks and deduplicates repeated task IDs", () => {
    expect(getJobDeliverableRows({ linked_tasks: [task("a"), task("a"), { ...task("b"), title: "Output a" }] })).toHaveLength(2);
  });
  it("follows task removal and reassignment without retaining phantom deliverables", () => {
    const job = { linked_tasks: [task("moved")] };
    expect(getJobDeliverableRows(job)).toHaveLength(1);
    expect(getJobDeliverableRows({ ...job, linked_tasks: [] })).toEqual([]);
  });
  it("preserves legacy planned outputs and undated linked tasks", () => {
    const rows = getJobDeliverableRows({ key_deliverables: ["Launch reel"], linked_tasks: [{ ...task("undated"), due_date: null }] });
    expect(rows.map(item => item.name)).toEqual(["Launch reel", "Output undated"]);
    expect(rows[1].date).toBeNull();
  });
});
