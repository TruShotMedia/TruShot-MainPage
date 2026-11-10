import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ service: vi.fn(), getTask: vi.fn(), updateTask: vi.fn(), createTask: vi.fn(), assigned: vi.fn(), subtasks: vi.fn(), archiveSubtasks: vi.fn() }));
vi.mock("./task-sync", () => ({
  syncClickUpJobSubtasks: mocks.subtasks, archiveClickUpJobSubtasks: mocks.archiveSubtasks,
  ClickUpSubtaskDeferredError: class extends Error {},
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.service }));
vi.mock("@/lib/clickup/assignment-scope", () => ({ assignedToClickUpOwner: mocks.assigned }));
vi.mock("@/lib/clickup/config", () => ({ getClickUpToken: () => "test", CLICKUP_LIST_ID: "list", CLICKUP_LIST_NAME: "Jobs", CLICKUP_STATUS_MAPPING: {} }));
vi.mock("@/lib/clickup/client", () => ({
  ClickUpApiError: class extends Error {}, getClickUpTask: mocks.getTask, updateClickUpTask: mocks.updateTask,
  createClickUpTask: mocks.createTask, deleteClickUpTask: vi.fn(), getClickUpAuthorizedUser: vi.fn(), getClickUpList: vi.fn(),
}));
vi.mock("@/lib/clickup/webhook-registration", () => ({ ensureClickUpWebhook: vi.fn() }));
import { dispatchClickUpJobSync } from "./job-sync";
import { sharedStateFromCrm, sharedStateHash } from "./shared-state";
import { buildClickUpJobDescription } from "./job-mapping";
import { ClickUpSubtaskDeferredError } from "./task-sync";

const workspace = "11111111-1111-4111-8111-111111111111";
const job = { id: "job", title: "Launch", client_id: "client", archived_at: null, status_id: "scheduled", updated_at: "2026-11-03", assignee_ids: ["john"],
  shoot_date: null, shoot_time: null, due_date: null, due_time: null, job_number: null, description: null, location: null, delivery_url: null, notes: null, photos_delivered: 0, deliverables: [] };
const baseline = sharedStateHash(sharedStateFromCrm(job, "SCHEDULED"));
type Result = { data: unknown; error: unknown };
let taskRows: { source_deliverable_id: null; status: { key: string } }[], taskError: unknown, link: { id: string; clickup_task_id: string; last_shared_hash: string } | null;
let queries: Query[];
let syncSubtasks: boolean;
class Query {
  action = "read"; selected = false; filters: Record<string, unknown> = {}; payload: unknown;
  constructor(readonly table: string) { queries.push(this); }
  select() { this.selected = true; return this; }
  eq(field: string, value: unknown) { this.filters[field] = value; return this; }
  in(field: string, value: unknown) { return this.eq(field, value); }
  is(field: string, value: unknown) { return this.eq(field, value); }
  lte() { return this; } lt() { return this; } order() { return this; } limit() { return this; }
  update(value: unknown) { this.action = "update"; this.payload = value; return this; }
  insert(value: unknown) { this.action = "insert"; this.payload = value; return this; }
  upsert(value: unknown) { this.action = "upsert"; this.payload = value; return this; }
  delete() { this.action = "delete"; return this; }
  result(): Result {
    if (this.action === "read") {
      if (this.table === "website-clickup-integrations") return { data: { workspace_id: workspace, target_client_id: "client", list_id: "list", enabled: true, sync_subtasks: syncSubtasks, assigned_user_id: 42, status_mapping: { scheduled: "SCHEDULED" } }, error: null };
      if (this.table === "website-jobs") return { data: job, error: null };
      if (this.table === "website-job-statuses") return { data: { key: "scheduled" }, error: null };
      if (this.table === "website-job-tasks") return { data: taskRows, error: taskError };
      if (this.table === "website-clickup-job-links") return { data: link, error: null };
      if (this.table === "website-clickup-sync-outbox") return { data: [{ id: "event", workspace_id: workspace, job_id: "job", operation: "upsert", status: "pending", attempts: 0 }], error: null };
    }
    if (this.table === "website-clickup-sync-outbox" && this.action === "update" && this.selected) return { data: { id: "event" }, error: null };
    return { data: null, error: null };
  }
  maybeSingle() { return Promise.resolve(this.result()); } single() { return Promise.resolve(this.result()); }
  then<T = Result, E = never>(resolve?: ((value: Result) => T | PromiseLike<T>) | null, reject?: ((reason: unknown) => E | PromiseLike<E>) | null) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}
beforeEach(() => {
  vi.clearAllMocks(); queries = []; syncSubtasks = false; mocks.subtasks.mockResolvedValue(undefined); taskError = null; link = { id: "link", clickup_task_id: "remote", last_shared_hash: baseline };
  taskRows = ["posted_done", "posted_done", "posted_done", "in_progress"].map(key => ({ source_deliverable_id: null, status: { key } }));
  mocks.service.mockReturnValue({ from: (table: string) => new Query(table) }); mocks.assigned.mockResolvedValue(true);
  mocks.getTask.mockResolvedValue({ id: "remote", name: job.title, status: { status: "SCHEDULED" } });
  mocks.updateTask.mockResolvedValue({ id: "remote" }); mocks.createTask.mockResolvedValue({ id: "created" });
});
describe("outbound ClickUp progress syncing", () => {
  it("updates the title when only child progress changes, without replacing dates or status", async () => {
    expect(await dispatchClickUpJobSync()).toMatchObject({ succeeded: 1, failed: 0 });
    expect(mocks.updateTask).toHaveBeenCalledWith("remote", expect.objectContaining({ name: "[85% · 3/4 done] Launch" }));
    const patch = mocks.updateTask.mock.calls[0][1];
    expect(patch).not.toHaveProperty("status"); expect(patch).not.toHaveProperty("start_date"); expect(patch).not.toHaveProperty("due_date");
    expect(queries.find(query => query.table === "website-job-tasks")?.filters).toEqual({ workspace_id: workspace, job_id: "job", archived_at: null });
    expect(queries.find(query => query.table === "website-jobs" && query.action !== "read")).toBeUndefined();
  });
  it("does not send a redundant ClickUp update when progress is already current", async () => {
    mocks.getTask.mockResolvedValue({ id: "remote", name: "[85% · 3/4 done] Launch", status: { status: "SCHEDULED" }, markdown_description: buildClickUpJobDescription({ ...job, progress: { completed: 3, total: 4, percent: 85 } }) });
    expect(await dispatchClickUpJobSync()).toMatchObject({ succeeded: 1 }); expect(mocks.updateTask).not.toHaveBeenCalled();
  });
  it("switches to job-status progress after the final task is removed", async () => {
    taskRows = []; mocks.getTask.mockResolvedValue({ id: "remote", name: "[1/1 · 100%] Launch", status: { status: "SCHEDULED" } });
    await dispatchClickUpJobSync(); expect(mocks.updateTask).toHaveBeenCalledWith("remote", expect.objectContaining({ name: "[10% · status] Launch" }));
  });
  it("preserves a real ClickUp rename and queues it for inbound syncing", async () => {
    mocks.getTask.mockResolvedValue({ id: "remote", name: "[3/4 · 75%] Renamed", status: { status: "SCHEDULED" } });
    await dispatchClickUpJobSync(); expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(queries.find(query => query.table === "website-clickup-webhook-events" && query.action === "upsert")).toBeDefined();
  });
  it("does not reset progress to zero when the task lookup fails", async () => {
    taskError = new Error("Task lookup failed");
    expect(await dispatchClickUpJobSync()).toMatchObject({ failed: 1, succeeded: 0 }); expect(mocks.updateTask).not.toHaveBeenCalled();
  });
  it.each(["deferred", "conflict"])("removes only the generated backlink when shared-field sync is %s", async outcome => {
    link = { id: "link", clickup_task_id: "remote", last_shared_hash: outcome === "deferred" ? baseline : "older-shared-state" };
    mocks.getTask.mockResolvedValue({
      id: "remote", name: "Renamed in ClickUp", status: { status: "SCHEDULED" },
      markdown_description: "Keep the remote briefing.\n\n[Open full brief & private attachments](https://www.trushotmedia.com/autopacific?job=job)\n\n[Delivery files](https://files.example.com/launch)",
    });
    expect(await dispatchClickUpJobSync()).toMatchObject({ succeeded: 1, failed: 0 });
    expect(mocks.updateTask).toHaveBeenCalledExactlyOnceWith("remote", {
      markdown_content: "Keep the remote briefing.\n\n[Delivery files](https://files.example.com/launch)",
    });
    expect(queries.find(query => query.table === "website-clickup-sync-audit" && query.action === "insert")?.payload)
      .toMatchObject({ outcome: outcome === "conflict" ? "conflict" : "ignored" });
    expect(queries.find(query => query.table === "website-jobs" && query.action !== "read")).toBeUndefined();
  });
  it("includes progress when creating the first ClickUp mirror", async () => {
    link = null; await dispatchClickUpJobSync();
    expect(mocks.createTask).toHaveBeenCalledWith("list", expect.objectContaining({ name: "[85% · 3/4 done] Launch" }));
  });
  it("syncs child assets only after saving a stable parent mapping", async () => {
    syncSubtasks = true;
    mocks.subtasks.mockImplementation(async input => {
      expect(input).toMatchObject({ jobId: "job", parentTaskId: "remote", job: { title: "Launch", status_key: "scheduled" } });
      expect(queries.some(query => query.table === "website-clickup-job-links" && query.action === "upsert")).toBe(true);
    });
    expect(await dispatchClickUpJobSync()).toMatchObject({ succeeded: 1,failed: 0 });
    expect(mocks.subtasks).toHaveBeenCalledOnce();
  });
  it("does not touch children while parent shared fields need conflict resolution", async () => {
    syncSubtasks = true; link!.last_shared_hash = "older-shared-state";
    mocks.getTask.mockResolvedValue({ id: "remote",name: "Conflicting name",status: { status: "SCHEDULED" } });
    await dispatchClickUpJobSync(); expect(mocks.subtasks).not.toHaveBeenCalled();
  });
  it("defers a busy child batch without exhausting the event retry count", async () => {
    syncSubtasks = true; mocks.subtasks.mockRejectedValue(new ClickUpSubtaskDeferredError("Lease busy"));
    expect(await dispatchClickUpJobSync()).toMatchObject({ succeeded: 0,failed: 0 });
    const deferred = queries.find(query => query.table === "website-clickup-sync-outbox" && query.action === "update" && (query.payload as { last_error?: string })?.last_error === "Lease busy");
    expect(deferred?.payload).toMatchObject({ status: "retry",processing_started_at: null });
    expect(deferred?.payload).not.toHaveProperty("attempts");
  });
});
