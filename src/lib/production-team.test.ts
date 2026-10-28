import { describe, expect, it } from "vitest";
import { assignedTo, jobProgress, mentionedMembers, scopeProductionSpace, teamInitials, type TeamMember } from "./production-team";
import { assignmentValues } from "./production-assignment-input";
import type { JobStatus, TabletKioskData } from "./types";

const john = "d61eb1c9-8a31-4c49-81fd-93dd478493ce", colleague = "938e5a99-a7e2-43f5-9d1c-f3e9d7e5aafc";
const workflow: JobStatus[] = ["planning", "scheduled", "in_production", "client_review", "delivered"].map((key, index) => ({
  id: key, key, label: key, color: "#579", position: index * 10, is_closed: key === "delivered",
}));

describe("job progress", () => {
  it.each([[0, 0], [1, 25], [2, 50], [3, 75], [4, 100]])("uses workflow stage %i for a job without tasks", (stage, percent) => {
    expect(jobProgress({ total_tasks: 0, open_tasks: 0, status: workflow[stage] }, workflow)).toEqual({ completed: 0, total: 0, percent });
  });
  it("resolves the status ID and uses the full sorted workflow without mutating it", () => {
    const delayed = { ...workflow[2], id: "delayed", key: "delayed", position: 25, is_closed: true };
    const unordered = [workflow[4], delayed, workflow[2], workflow[0], workflow[3], workflow[1]];
    expect(jobProgress({ total_tasks: 0, open_tasks: 0, status_id: "client_review" }, unordered).percent).toBe(75);
    expect(unordered.map(stage => stage.id)).toEqual(["delivered", "delayed", "in_production", "planning", "client_review", "scheduled"]);
    expect(jobProgress({ total_tasks: 0, open_tasks: 0, status: delayed }, unordered).percent).toBe(0);
  });
  it("keeps task completion authoritative whenever tasks exist", () => {
    expect(jobProgress({ total_tasks: 4, completed_tasks: 1, open_tasks: 2, status: workflow[4] }, workflow).percent).toBe(25);
    expect(jobProgress({ total_tasks: 4, completed_tasks: 0, open_tasks: 4, status: workflow[3] }, workflow).percent).toBe(0);
    expect(jobProgress({ total_tasks: 4, completed_tasks: 4, open_tasks: 0, status: workflow[1] }, workflow).percent).toBe(100);
  });
  it("does not invent progress for an unknown or unavailable status", () => {
    expect(jobProgress({ total_tasks: 0, open_tasks: 0 }, workflow).percent).toBe(0);
    expect(jobProgress({ total_tasks: 0, open_tasks: 0, status_id: "unknown" }, workflow).percent).toBe(0);
    expect(jobProgress({ total_tasks: 0, open_tasks: 0, status: workflow[0] }, [workflow[0]]).percent).toBe(0);
  });
});

describe("production team scope", () => {
  it("requires an explicit matching assignment", () => {
    expect(assignedTo({}, [john])).toBe(false);
    expect(assignedTo({ assignee_ids: [colleague, john] }, [john])).toBe(true);
    expect(assignedTo({ assignee_ids: [john] }, [])).toBe(false);
  });
  it("filters each entity by its own assignees, rather than inheriting its job's visibility", () => {
    const first = { id: "john", assignee_ids: [john] }, second = { id: "colleague", assignee_ids: [colleague] };
    const data = { pipelineJobs: [first], pipelineTasks: [second], calendarJobs: [first], calendarTasks: [second], calendarEvents: [first], flightEvents: [second], calendarCampaignAssets: [], statuses: [], jobStatuses: [], clientOptions: [], jobOptions: [], pendingRequestCount: 0 } as unknown as TabletKioskData;
    const mine = scopeProductionSpace(data, [colleague]);
    expect(mine.pipelineJobs).toEqual([]); expect(mine.pipelineTasks.map(item => item.id)).toEqual(["colleague"]);
    expect(mine.calendarEvents).toEqual([]); expect(mine.flightEvents.map(item => item.id)).toEqual(["colleague"]);
    const all = scopeProductionSpace(data, [john, colleague], true);
    expect(all.calendarJobs).toHaveLength(1); expect(all.calendarTasks).toHaveLength(1);
    expect(all.calendarEvents).toEqual([]); expect(all.flightEvents).toEqual([]);
  });
  it("uses actual completed task counts, not delayed or closed tasks", () => {
    expect(jobProgress({ total_tasks: 4, completed_tasks: 1, open_tasks: 2 })).toEqual({ completed: 1, total: 4, percent: 25 });
    expect(jobProgress({ total_tasks: 0, open_tasks: 0 }).percent).toBe(0);
  });
  it("turns real team handles into mention IDs; hidden members aren't taggable", () => {
    const members = [{ user_id: john, username: "john", is_active: true }, { user_id: colleague, username: "colleague", is_active: false }] as TeamMember[];
    expect(mentionedMembers("Hi @JOHN can you check this? @colleague", members)).toEqual([john]);
    expect(mentionedMembers("john@example.com", members)).toEqual([]);
    expect(teamInitials("John Herholdt")).toBe("JH");
  });
  it("preserves omitted legacy form assignments but rejects an explicit empty selection", () => {
    const form = new FormData(); expect(assignmentValues(form)).toEqual({});
    form.set("assignee_ids", "[]"); expect(() => assignmentValues(form)).toThrow();
    form.set("assignee_ids", JSON.stringify([john, john])); expect(assignmentValues(form)).toEqual({ assignee_ids: [john] });
    form.set("assignee_ids", "bad-json"); expect(() => assignmentValues(form)).toThrow();
  });
});
