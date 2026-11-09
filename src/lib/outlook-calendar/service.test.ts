import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), fetchFeed: vi.fn(), parse: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.client }));
vi.mock("./crypto", () => ({ encryptFeedUrl: () => ({ ciphertext: "encrypted", iv: "iv", tag: "tag" }), decryptFeedUrl: () => "https://outlook.office365.com/owa/calendar/private/calendar.ics" }));
vi.mock("./feed", async importOriginal => ({ ...await importOriginal<typeof import("./feed")>(), fetchOutlookFeed: mocks.fetchFeed }));
vi.mock("./parse", () => ({ parseOutlookCalendar: mocks.parse }));
import { connectOutlookCalendar, disconnectOutlookCalendar, getOutlookStatuses, syncOutlookCalendar } from "./service";
import { OutlookFeedError } from "./feed";

function database(results: unknown[]) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const value = results.shift();
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "insert", "update", "delete", "eq", "or", "lt", "lte", "order", "limit", "single", "maybeSingle"]) chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
    chain.then = (resolve: (result: unknown) => unknown) => Promise.resolve(value).then(resolve);
    return chain;
  });
  return { client: { from }, calls };
}
const existingEvents = [{ id: "outlook-existing" }];
const row = { id: "calendar", user_id: "owner", name: "Work", events: existingEvents, failure_count: 0 };
const secret = { encrypted_url: {}, etag: "v1", expanded_on: new Date().toISOString().slice(0, 10) };
beforeEach(() => { vi.clearAllMocks(); mocks.parse.mockResolvedValue(existingEvents); });
describe("Outlook synchronization safety", () => {
  it("returns only safe connection metadata, not event details or a feed URL", async () => {
    const db = database([{ data: [{ ...row, last_success_at: null, last_attempt_at: null, last_error: null }] }]);
    const statuses = await getOutlookStatuses(db.client as never);
    expect(statuses[0]).toEqual({ id: "calendar", name: "Work", event_count: 1, last_success_at: null, last_attempt_at: null, last_error: null });
    expect(JSON.stringify(db.calls)).not.toContain("encrypted_url");
  });
  it("scopes manual refresh and disconnect to the authenticated owner", async () => {
    const db = database([{ data: null }, { error: null }]); mocks.client.mockReturnValue(db.client);
    expect(await syncOutlookCalendar("calendar", "owner")).toEqual({ status: "busy" });
    await disconnectOutlookCalendar("owner", "calendar");
    expect(db.calls.filter(call => call.method === "eq" && call.args[0] === "user_id").map(call => call.args[1])).toEqual(["owner", "owner"]);
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });
  it("skips parser and event rewrites when Microsoft returns 304", async () => {
    const db = database([{ data: row }, { data: secret }, { error: null }]); mocks.client.mockReturnValue(db.client);
    mocks.fetchFeed.mockResolvedValue({ unchanged: true });
    expect(await syncOutlookCalendar("calendar")).toEqual({ status: "synced", changed: false });
    expect(mocks.parse).not.toHaveBeenCalled();
    const save = db.calls.filter(call => call.method === "update").at(-1)!;
    expect(save.args[0]).not.toHaveProperty("events");
  });
  it("retains the last good events and backs off after fetch/parse failure", async () => {
    const db = database([{ data: row }, { data: secret }, { error: null }]); mocks.client.mockReturnValue(db.client);
    mocks.fetchFeed.mockRejectedValue(new Error("private feed contents https://secret"));
    expect(await syncOutlookCalendar("calendar")).toEqual({ status: "unavailable" });
    const update = db.calls.filter(call => call.method === "update").at(-1)!.args[0] as Record<string, unknown>;
    expect(update).not.toHaveProperty("events");
    expect(update.failure_count).toBe(1);
    expect(String(update.last_error)).not.toContain("secret");
  });
  it("replaces the full snapshot on success (including removals) before advancing validators", async () => {
    const db = database([{ data: row }, { data: secret }, { error: null }, { error: null }]); mocks.client.mockReturnValue(db.client);
    mocks.fetchFeed.mockResolvedValue({ unchanged: false, body: "calendar", etag: "v2" }); mocks.parse.mockResolvedValue([]);
    expect(await syncOutlookCalendar("calendar")).toEqual({ status: "synced", changed: true });
    const updates = db.calls.filter(call => call.method === "update");
    expect(updates[1].args[0]).toHaveProperty("events", []);
    expect(updates[2].table).toBe("website-outlook-feed-secrets");
    expect(updates[2].args[0]).toHaveProperty("etag", "v2");
  });
  it("does not advance validators if snapshot persistence fails", async () => {
    const db = database([{ data: row }, { data: secret }, { error: { message: "write failed" } }, { error: null }]); mocks.client.mockReturnValue(db.client);
    mocks.fetchFeed.mockResolvedValue({ unchanged: false, body: "calendar", etag: "v2" });
    expect(await syncOutlookCalendar("calendar")).toEqual({ status: "unavailable" });
    expect(db.calls.some(call => call.method === "update" && call.table === "website-outlook-feed-secrets")).toBe(false);
  });
  it("fetches a fresh body daily to roll the recurrence window forward", async () => {
    const db = database([{ data: row }, { data: { ...secret, expanded_on: "2020-01-01" } }, { error: null }]); mocks.client.mockReturnValue(db.client);
    mocks.fetchFeed.mockResolvedValue({ unchanged: true });
    await syncOutlookCalendar("calendar");
    expect(mocks.fetchFeed.mock.calls[0][1]).toEqual({});
  });
  it("does not overwrite an existing connection", async () => {
    const db = database([{ data: { id: "existing" } }]); mocks.client.mockReturnValue(db.client);
    await expect(connectOutlookCalendar("owner", { name: "Work", url: "https://outlook.office365.com/owa/calendar/private/calendar.ics" })).rejects.toThrow(OutlookFeedError);
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });
});
