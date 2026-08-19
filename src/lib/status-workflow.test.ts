import { describe, expect, it } from "vitest";
import { changeWorkflowStatus, getGroupSelectionState, sortWorkflowStatuses, visiblePipelineStatuses } from "./status-workflow";

describe("status workflow helpers", () => {
  it("moves only the selected records", () => {
    const records = [
      { id: "one", status_id: "planning", title: "One" },
      { id: "two", status_id: "planning", title: "Two" },
      { id: "three", status_id: "review", title: "Three" },
    ];

    expect(changeWorkflowStatus(records, ["one", "three"], "delivered")).toEqual([
      { id: "one", status_id: "delivered", title: "One" },
      { id: "two", status_id: "planning", title: "Two" },
      { id: "three", status_id: "delivered", title: "Three" },
    ]);
  });

  it("reports full and partial group selections", () => {
    expect(getGroupSelectionState(["one", "two"], new Set(["one"]))).toEqual({
      allSelected: false,
      partiallySelected: true,
      selectedCount: 1,
    });
    expect(getGroupSelectionState(["one", "two"], new Set(["one", "two"]))).toEqual({
      allSelected: true,
      partiallySelected: false,
      selectedCount: 2,
    });
  });

  it("orders statuses and hides Posted / Done only from the pipeline", () => {
    const statuses = [
      { id: "done", key: "posted_done", position: 60 },
      { id: "ready", key: "ready_to_post", position: 50 },
      { id: "started", key: "not_started", position: 10 },
    ];

    expect(sortWorkflowStatuses(statuses).map((status) => status.id)).toEqual(["started", "ready", "done"]);
    expect(visiblePipelineStatuses(statuses).map((status) => status.id)).toEqual(["started", "ready"]);
  });
});
