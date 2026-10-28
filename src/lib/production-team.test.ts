import { describe, expect, it } from "vitest";
import { assignedTo, jobProgress, mentionedMembers, scopeProductionSpace, teamInitials, type TeamMember } from "./production-team";
import { assignmentValues } from "./production-assignment-input";
import type { TabletKioskData } from "./types";

const john = "d61eb1c9-8a31-4c49-81fd-93dd478493ce", colleague = "938e5a99-a7e2-43f5-9d1c-f3e9d7e5aafc";
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
