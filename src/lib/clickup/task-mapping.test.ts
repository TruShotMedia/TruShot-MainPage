import { describe, expect, it } from "vitest";
import { buildClickUpAssetPayload, clickUpAssetMarker, clickUpAssetPayloadHash, clickUpAssetUpdatePayload, ownsClickUpAsset, type ClickUpAssetSnapshot } from "./task-mapping";

const task: ClickUpAssetSnapshot = { id: "asset", title: "Preview reel", description: "Keep the horizon level", asset_type: "Asset", hours: 2.5, priority: "normal", due_date: null, due_time: null, due_date_is_override: false, status: { key: "not_started" } };
const input = { workspaceId: "workspace", assignedUserId: 42, parentTaskId: "parent", task, job: { id: "job", title: "Launch", due_date: "2026-11-06", due_time: "15:30:00", status_key: "scheduled" } };
describe("CRM asset → ClickUp subtask mapping", () => {
  it.each([["not_started","SCHEDULED"],["in_progress","EDITING"],["ready_for_revision","APPROVAL"],["final_draft_notes","APPROVAL"],["ready_to_post","APPROVAL"],["posted_done","COMPLETE"],["delayed","DELAYED"]])("maps %s to %s", (key, status) => {
    expect(buildClickUpAssetPayload({ ...input, task: { ...task, status: { key } } }).status).toBe(status);
  });
  it("keeps unstarted planning work in PLANNING", () => {
    expect(buildClickUpAssetPayload({ ...input, job: { ...input.job, status_key: "planning" } }).status).toBe("PLANNING");
  });
  it("rejects unmapped statuses rather than completing unknown work", () => {
    expect(() => buildClickUpAssetPayload({ ...input, task: { ...task, status: null } })).toThrow("No ClickUp status");
  });
  it("inherits the job deadline and Brisbane time; explicit dates take priority", () => {
    expect(buildClickUpAssetPayload(input)).toMatchObject({ parent: "parent", assignees: [42], due_date: Date.parse("2026-11-06T15:30:00+10:00"), due_date_time: true });
    expect(buildClickUpAssetPayload({ ...input, task: { ...task, due_date: "2026-11-04", due_date_is_override: true } })).toMatchObject({ due_date: Date.parse("2026-11-04T00:00:00+10:00"), due_date_time: false });
    expect(buildClickUpAssetPayload({ ...input, job: { ...input.job, due_date: null } })).toMatchObject({ due_date: null, due_date_time: false });
  });
  it.each([["urgent",1],["high",2],["normal",3],["low",4]] as const)("maps %s priority", (priority, expected) => {
    expect(buildClickUpAssetPayload({ ...input, task: { ...task, priority } }).priority).toBe(expected);
  });
  it("includes real hours and notes, without fabricating time entries or CRM backlinks", () => {
    const payload = buildClickUpAssetPayload(input);
    expect(payload.markdown_content).toContain("**Hours logged:** 2.5h");
    expect(payload.markdown_content).toContain(task.description);
    expect(payload.markdown_content).not.toContain("trushotmedia.com");
    expect(payload).not.toHaveProperty("time_estimate");
    expect(clickUpAssetUpdatePayload(payload).assignees).toEqual({ add: [42], rem: [] });
  });
  it("recovers only an exact workspace/task marker, including its plain text equivalent", () => {
    const marker = clickUpAssetMarker("workspace", "asset");
    expect(ownsClickUpAsset(`Notes\n${marker}`, "workspace", "asset")).toBe(true);
    expect(ownsClickUpAsset(marker.replaceAll("`", ""), "workspace", "asset")).toBe(true);
    expect(ownsClickUpAsset(marker, "other", "asset")).toBe(false);
    expect(ownsClickUpAsset(marker + " copied", "workspace", "asset")).toBe(false);
  });
  it("hashes all outbound fields, including renames and reparenting", () => {
    const original = clickUpAssetPayloadHash(buildClickUpAssetPayload(input));
    expect(clickUpAssetPayloadHash(buildClickUpAssetPayload(input))).toBe(original);
    expect(clickUpAssetPayloadHash(buildClickUpAssetPayload({ ...input, parentTaskId: "other" }))).not.toBe(original);
    expect(clickUpAssetPayloadHash(buildClickUpAssetPayload({ ...input, task: { ...task, title: "New name" } }))).not.toBe(original);
  });
});
