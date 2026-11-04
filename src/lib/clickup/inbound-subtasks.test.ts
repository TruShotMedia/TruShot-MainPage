import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ service: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.service }));
vi.mock("./client", () => ({ getClickUpTask: mocks.get,getClickUpTasks: vi.fn(),ClickUpApiError: class extends Error {} }));
import { dispatchClickUpInboundSync } from "./inbound-sync";
type Row = Record<string, unknown>;
let queries: Query[], owned: boolean, ownedError: Error | null;
class Query {
  action = "read"; selected = false; values: Row = {}; filters: Row = {};
  constructor(readonly table: string) { queries.push(this); }
  select() { this.selected = true; return this; }
  eq(k: string,v: unknown) { this.filters[k] = v; return this; }
  in() { return this; } lt() { return this; } lte() { return this; } order() { return this; } limit() { return this; }
  update(values: Row) { this.action = "update"; this.values = values; return this; }
  insert(values: Row) { this.action = "insert"; this.values = values; return this; }
  run() {
    if (this.action === "read") {
      if (this.table === "website-clickup-integrations") return { data: { workspace_id: "workspace",list_id: "list",assigned_user_id: 42,inbound_mode: "active",import_new_tasks: true },error: null };
      if (this.table === "website-clickup-webhook-events") return { data: [{ id: "event",workspace_id: "workspace",clickup_task_id: "child",event_type: "taskUpdated",status: "pending",attempts: 0 }],error: null };
      if (this.table === "website-clickup-subtask-links") return { data: owned ? { task_id: "asset" } : null,error: ownedError };
    }
    if (this.table === "website-clickup-webhook-events" && this.action === "update" && this.selected) return { data: { id: "event" },error: null };
    return { data: null,error: null };
  }
  maybeSingle() { return Promise.resolve(this.run()); }
  then<T>(resolve: (value: ReturnType<Query["run"]>) => T) { return Promise.resolve(this.run()).then(resolve); }
}
beforeEach(() => {
  vi.clearAllMocks(); queries = []; owned = false; ownedError = null;
  mocks.service.mockReturnValue({ from: (table: string) => new Query(table) });
  mocks.get.mockResolvedValue({ id: "child",name: "Asset",parent: "parent",list: { id: "list" },assignees: [{ id: 42 }] });
});
describe("outbound-only asset webhook isolation", () => {
  it("never imports normal ClickUp subtasks as top-level CRM jobs", async () => {
    expect(await dispatchClickUpInboundSync()).toMatchObject({ processed: 1,failed: 0 });
    expect(queries.find(q => q.table === "website-jobs")).toBeUndefined();
    expect(queries.find(q => q.table === "website-clickup-webhook-events" && q.values.status === "ignored")).toBeDefined();
  });
  it("still rejects a managed asset converted to top-level, even when child mirroring is paused", async () => {
    owned = true; mocks.get.mockResolvedValue({ id: "child",parent: null,list: { id: "list" },assignees: [{ id: 42 }] });
    expect(await dispatchClickUpInboundSync()).toMatchObject({ processed: 1,failed: 0 });
    expect(queries.find(q => q.table === "website-jobs")).toBeUndefined();
    const lookup = queries.find(q => q.table === "website-clickup-subtask-links");
    expect(lookup?.filters).toEqual({ workspace_id: "workspace",clickup_task_id: "child" });
    expect(queries.find(q => q.values.last_error === "CRM asset subtasks are outbound-only.")).toBeDefined();
  });
  it("fails closed if managed-asset ownership cannot be checked", async () => {
    ownedError = new Error("Ownership unavailable"); mocks.get.mockResolvedValue({ id: "child",parent: null });
    expect(await dispatchClickUpInboundSync()).toMatchObject({ failed: 1,processed: 0 });
    expect(queries.find(q => q.table === "website-jobs")).toBeUndefined();
  });
});
