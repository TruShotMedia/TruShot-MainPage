import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClickUpTask } from "./client";
import { clickUpAssetMarker } from "./task-mapping";
const api = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("./client", () => ({
  ClickUpApiError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
  getClickUpTask: api.get, createClickUpTask: api.create, updateClickUpTask: api.update,
}));
import { ClickUpApiError } from "./client";
import { archiveClickUpJobSubtasks, ClickUpSubtaskDeferredError, syncClickUpJobSubtasks } from "./task-sync";

type Row = Record<string, unknown>;
let tasks: Row[], links: Row[], remotes: Map<string, ClickUpTask>, allowLease: boolean, failSavedId: boolean, taskError: Error | null;
const rpc = vi.fn();
class Query {
  action = "read"; filters: [string, unknown, boolean][] = []; values: Row = {};
  constructor(readonly table: string) {}
  select() { return this; }
  eq(k: string, v: unknown) { this.filters.push([k,v,false]); return this; }
  is(k: string, v: unknown) { return this.eq(k,v); }
  in(k: string, v: unknown[]) { this.filters.push([k,v,true]); return this; }
  update(values: Row) { this.action = "update"; this.values = values; return this; }
  insert(values: Row) { this.action = "insert"; this.values = values; return this; }
  run() {
    const rows = this.table === "website-job-tasks" ? tasks : links;
    if (this.table === "website-job-tasks" && taskError) return { data: null, error: taskError };
    const matches = rows.filter(row => this.filters.every(([k,v,many]) => many ? (v as unknown[]).includes(row[k]) : (row[k] ?? null) === v));
    if (this.action === "insert") links.push({ clickup_task_id: null, last_payload_hash: null, create_attempted_at: null, archived_at: null, ...this.values });
    if (this.action === "update") {
      if (failSavedId && this.values.clickup_task_id) { failSavedId = false; return { data: null, error: new Error("DB write interrupted") }; }
      for (const row of matches) Object.assign(row,this.values);
    }
    return { data: this.action === "read" ? matches.map(row => ({ ...row })) : null, error: null };
  }
  then<T>(resolve: (value: ReturnType<Query["run"]>) => T) { return Promise.resolve(this.run()).then(resolve); }
}
const integration = { workspace_id: "workspace", list_id: "list", assigned_user_id: 42, sync_subtasks: true };
const job = { id: "job", title: "Launch", due_date: "2026-11-06", due_time: null, status_key: "scheduled" };
const supabase = { from: (table: string) => new Query(table), rpc } as unknown as SupabaseClient;
function sync(extra = {}) { return syncClickUpJobSubtasks({ supabase, integration, jobId: job.id, parentTaskId: "parent", job, ...extra }); }
beforeEach(() => {
  vi.clearAllMocks(); allowLease = true; failSavedId = false; taskError = null; links = [];
  tasks = [{ id: "asset", workspace_id: "workspace", job_id: "job", archived_at: null, title: "Reel", description: "Notes", asset_type: "Asset", hours: 2, priority: "normal", due_date: null, due_time: null, due_date_is_override: false, status: { key: "not_started" } }];
  remotes = new Map([["parent", { id: "parent", parent: null, list: { id: "list" }, subtasks: [] }]]);
  rpc.mockImplementation(async (_name, input) => ({ data: input.p_action !== "claim" || allowLease, error: null }));
  api.get.mockImplementation(async id => {
    const value = remotes.get(id);
    if (!value) throw new ClickUpApiError("Missing",404);
    if (id === "parent") return { ...value, subtasks: [...remotes.values()].filter(row => row.parent === id) };
    return { ...value };
  });
  api.create.mockImplementation(async (_list, payload) => {
    expect(links.find(row => row.task_id === "asset")?.create_attempted_at).toBeTruthy();
    const remote = { ...payload, id: `child-${remotes.size}`, list: { id: "list" }, markdown_description: payload.markdown_content };
    remotes.set(remote.id, remote); return remote;
  });
  api.update.mockImplementation(async (id, payload) => {
    const remote = { ...remotes.get(id)!, ...payload }; remotes.set(id, remote); return remote;
  });
});
describe("one-way ClickUp child sync", () => {
  it("reserves before creating a real subtask, then skips unchanged records", async () => {
    expect(await sync()).toMatchObject({ created: 1 });
    expect(api.create).toHaveBeenCalledWith("list",expect.objectContaining({ parent: "parent", name: "Reel", status: "SCHEDULED" }));
    expect(links[0]).toMatchObject({ task_id: "asset", clickup_task_id: "child-1", job_id: "job" });
    vi.clearAllMocks();
    expect(await sync()).toMatchObject({ unchanged: 1 });
    expect(api.get).not.toHaveBeenCalled(); expect(api.update).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
  });
  it("renames and updates status/hours/deadline on the same child ID", async () => {
    await sync(); Object.assign(tasks[0], { title: "New reel", hours: 4, due_date: "2026-11-05", status: { key: "posted_done" } });
    await sync();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith("child-1",expect.objectContaining({ name: "New reel", status: "COMPLETE", markdown_content: expect.stringContaining("4h") }));
  });
  it("reparents the existing ClickUp ID and does not archive it from the old parent's queue", async () => {
    await sync(); tasks[0].job_id = "other";
    await sync({ jobId: "other", parentTaskId: "other-parent", job: { ...job,id: "other" } });
    await sync();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith("child-1",expect.objectContaining({ parent: "other-parent" }));
    expect(remotes.get("child-1")?.archived).toBe(false);
  });
  it("archives removed assets but leaves manually created ClickUp children alone", async () => {
    await sync(); remotes.set("manual", { id: "manual",parent: "parent",list: { id: "list" } }); tasks = [];
    await sync();
    expect(api.update).toHaveBeenCalledExactlyOnceWith("child-1", { archived: true });
    expect(remotes.get("manual")?.archived).toBeUndefined();
    expect(links[0].archived_at).toBeTruthy();
  });
  it("archives children before removing an entire parent", async () => {
    await sync(); await archiveClickUpJobSubtasks({ supabase,integration,jobId: "job" });
    expect(remotes.get("child-1")?.archived).toBe(true);
  });
  it("restores the same mapped child rather than duplicating it", async () => {
    await sync(); tasks[0].archived_at = "2026-11-04"; await sync(); tasks[0].archived_at = null; await sync();
    expect(api.create).toHaveBeenCalledTimes(1); expect(remotes.get("child-1")?.archived).toBe(false);
  });
  it("recovers the posted child after the mapping save fails", async () => {
    failSavedId = true;
    await expect(sync()).rejects.toThrow("DB write interrupted");
    await sync();
    expect(api.create).toHaveBeenCalledTimes(1); expect(links[0].clickup_task_id).toBe("child-1");
  });
  it("does not repeat an ambiguous POST without confirmation", async () => {
    api.create.mockRejectedValue(new Error("Request timed out"));
    await expect(sync()).rejects.toThrow("timed out");
    await expect(sync()).rejects.toThrow("without creating a duplicate");
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it("can retry a definitive rate-limit rejection", async () => {
    api.create.mockRejectedValueOnce(new ClickUpApiError("Rate limited",429));
    await expect(sync()).rejects.toThrow("Rate limited");
    expect(links[0].create_attempted_at).toBeNull();
    await sync(); expect(links[0].clickup_task_id).toBe("child-1");
  });
  it("refuses duplicate identity markers instead of choosing an arbitrary child", async () => {
    links.push({ workspace_id: "workspace",task_id: "asset",job_id: "job",parent_clickup_task_id: "parent",create_attempted_at: "2026-11-04",archived_at: null });
    for (const id of ["one","two"]) remotes.set(id,{ id,parent: "parent",list: { id: "list" },markdown_description: clickUpAssetMarker("workspace","asset") });
    await expect(sync()).rejects.toThrow("More than one"); expect(api.create).not.toHaveBeenCalled();
  });
  it("recovers and archives an uncertain create even if the CRM asset was removed before retry", async () => {
    failSavedId = true; await expect(sync()).rejects.toThrow("DB write interrupted"); tasks = [];
    await sync();
    expect(api.create).toHaveBeenCalledTimes(1); expect(remotes.get("child-1")?.archived).toBe(true);
    expect(links[0].archived_at).toBeTruthy();
  });
  it("does not read or mutate assets from another workspace or parent", async () => {
    tasks.push({ ...tasks[0],id: "foreign",workspace_id: "other-workspace" },{ ...tasks[0],id: "different-job",job_id: "other-job" });
    await sync(); expect(api.create).toHaveBeenCalledTimes(1); expect(links).toHaveLength(1);
  });
  it("refuses to mutate a mapped item moved out of the configured List", async () => {
    await sync(); remotes.get("child-1")!.list = { id: "other-list" }; tasks[0].title = "Changed";
    await expect(sync()).rejects.toThrow("outside its subtask/List scope"); expect(api.update).not.toHaveBeenCalled();
  });
  it("defers without API traffic when another worker owns the lease", async () => {
    allowLease = false; await expect(sync()).rejects.toBeInstanceOf(ClickUpSubtaskDeferredError); expect(api.get).not.toHaveBeenCalled();
  });
  it("releases the lease and does not archive anything on a CRM read failure", async () => {
    taskError = new Error("Unavailable"); await expect(sync()).rejects.toThrow("Unavailable");
    expect(rpc).toHaveBeenLastCalledWith("website-clickup-subtask-lease",expect.objectContaining({ p_action: "release" }));
    expect(api.update).not.toHaveBeenCalled();
  });
  it("makes no queries or HTTP calls while disabled", async () => {
    await sync({ integration: { ...integration,sync_subtasks: false } }); expect(rpc).not.toHaveBeenCalled(); expect(api.get).not.toHaveBeenCalled();
  });
});
