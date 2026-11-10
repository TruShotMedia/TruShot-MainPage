import { describe, expect, it } from "vitest";
import { jobFollowsLinkedTasks, linkedTaskJobStatus } from "./job-status-rollup";

const task = (status_key: string) => ({ status_key });
describe("least-advanced linked task sets the job stage", () => {
  it.each([
    ["not_started", "scheduled"], ["in_progress", "production"],
    ["ready_for_revision", "review"], ["final_draft_notes", "review"],
    ["ready_to_post", "review"], ["posted_done", "delivered"],
  ])("maps %s to %s", (key, expected) => {
    expect(linkedTaskJobStatus("scheduled", [task(key)])).toBe(expected);
  });
  it("cannot outrun its slowest task and moves back when work reopens", () => {
    expect(linkedTaskJobStatus("review", [task("posted_done"), task("final_draft_notes"), task("in_progress")])).toBe("production");
    expect(linkedTaskJobStatus("delivered", [task("posted_done"), task("not_started")])).toBe("scheduled");
  });
  it("leaves standalone jobs, planning drafts and delayed originals manual", () => {
    for (const key of ["planning", "scheduled", "production", "review", "delivered", "delayed"])
      expect(linkedTaskJobStatus(key, [])).toBeNull();
    expect(linkedTaskJobStatus("planning", [task("not_started")])).toBeNull();
    expect(linkedTaskJobStatus("delayed", [task("not_started")])).toBeNull();
  });
  it("ignores archived and delayed history, without assuming unknown work is done", () => {
    expect(linkedTaskJobStatus("production", [task("delayed"), { ...task("not_started"), archived_at: "today" }, task("posted_done")])).toBe("delivered");
    expect(linkedTaskJobStatus("production", [task("delayed")])).toBeNull();
    expect(linkedTaskJobStatus("review", [task("unknown"), task("posted_done")])).toBe("scheduled");
  });
  it("enables the rule only for AutoPacific, not another client's jobs", () => {
    const job = { status: { key: "production" }, linked_tasks: [task("in_progress")] };
    expect(jobFollowsLinkedTasks({ ...job, client: { name: "Autopacific Group" } } as Parameters<typeof jobFollowsLinkedTasks>[0])).toBe(true);
    expect(jobFollowsLinkedTasks({ ...job, client: { name: "Ravish Media" } } as Parameters<typeof jobFollowsLinkedTasks>[0])).toBe(false);
  });
});
