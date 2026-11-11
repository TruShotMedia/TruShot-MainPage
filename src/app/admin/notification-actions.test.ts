import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mocks.context }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/push-notifications", () => ({ sendPushNotifications: mocks.send }));
import { getPushSubscriptionState, savePushSubscription, sendTestPushNotification } from "./notification-actions";

const endpoint = "https://push.example.test/device";
const subscription = { endpoint, expirationTime: null, keys: { p256dh: "public-key-of-sufficient-length", auth: "auth-key-long-enough" } };
let calls: unknown[][];
let registered: { client_scope_id: string | null } | null;
let clientError: boolean;
class Query {
  constructor(readonly table: string) {}
  select(...args: unknown[]) { calls.push([this.table, "select", ...args]); return this; }
  eq(...args: unknown[]) { calls.push([this.table, "eq", ...args]); return this; }
  is(...args: unknown[]) { calls.push([this.table, "is", ...args]); return this; }
  ilike(...args: unknown[]) { calls.push([this.table, "ilike", ...args]); return this; }
  upsert(...args: unknown[]) { calls.push([this.table, "upsert", ...args]); return Promise.resolve({ error: null }); }
  single() { return Promise.resolve({ data: clientError ? null : { id: "apg" }, error: clientError ? { message: "secret database detail" } : null }); }
  maybeSingle() { return Promise.resolve({ data: registered, error: null }); }
  then<T>(resolve: (value: { data: unknown[]; error: null }) => T) { return Promise.resolve({ data: [{ id: "device", endpoint }], error: null }).then(resolve); }
}
beforeEach(() => {
  vi.clearAllMocks(); calls = []; registered = { client_scope_id: null }; clientError = false;
  mocks.context.mockResolvedValue({ access: "trushot", claims: { sub: "verified-user" }, membership: { workspace_id: "workspace" }, supabase: { from: (table: string) => new Query(table) } });
  mocks.send.mockResolvedValue({ configured: true, delivered: 1, failed: 0, expiredIds: [] });
});
describe("app-specific push registration", () => {
  it("requires an authenticated account", async () => {
    mocks.context.mockResolvedValue(null);
    await expect(savePushSubscription(subscription, "autopacific")).rejects.toThrow("session");
    await expect(getPushSubscriptionState(endpoint, "trushot")).rejects.toThrow("session");
    expect(calls).toEqual([]);
  });
  it("registers the AutoPacific app separately even for a full CRM admin", async () => {
    await savePushSubscription(subscription, "autopacific");
    expect(calls).toContainEqual(["website-clients", "eq", "workspace_id", "workspace"]);
    expect(calls).toContainEqual(["website-clients", "ilike", "name", "autopacific group"]);
    expect(calls).toContainEqual(["website-push-subscriptions", "upsert", expect.objectContaining({ user_id: "verified-user", workspace_id: "workspace", client_scope_id: "apg" }), { onConflict: "endpoint" }]);
  });
  it("keeps TruShot registrations unscoped, ignoring caller-supplied identity or scope", async () => {
    await savePushSubscription({ ...subscription, user_id: "victim", client_scope_id: "apg" }, "trushot");
    expect(calls).toContainEqual(["website-push-subscriptions", "upsert", expect.objectContaining({ user_id: "verified-user", client_scope_id: null }), { onConflict: "endpoint" }]);
  });
  it("does not let an AutoPacific-only account register for TruShot", async () => {
    (await mocks.context()).access = "autopacific";
    await expect(savePushSubscription(subscription, "trushot")).rejects.toThrow("only enable AutoPacific");
    expect(calls.some(call => call[1] === "upsert")).toBe(false);
  });
  it("retains the AutoPacific scope for older scoped clients that omit the experience", async () => {
    (await mocks.context()).access = "autopacific";
    await savePushSubscription(subscription);
    expect(calls).toContainEqual(["website-push-subscriptions", "upsert", expect.objectContaining({ client_scope_id: "apg" }), { onConflict: "endpoint" }]);
  });
  it("fails closed if the authorised client cannot be resolved", async () => {
    clientError = true;
    await expect(savePushSubscription(subscription, "autopacific")).rejects.toThrow("access could not be verified");
    expect(calls.some(call => call[1] === "upsert")).toBe(false);
  });
  it("distinguishes app mismatch from an old account without modifying either registration", async () => {
    expect(await getPushSubscriptionState(endpoint, "autopacific")).toEqual({ registered: true, experienceMatches: false });
    expect(await getPushSubscriptionState(endpoint, "trushot")).toEqual({ registered: true, experienceMatches: true });
    registered = { client_scope_id: "apg" };
    expect(await getPushSubscriptionState(endpoint, "autopacific")).toEqual({ registered: true, experienceMatches: true });
    expect(await getPushSubscriptionState(endpoint, "trushot")).toEqual({ registered: true, experienceMatches: false });
    registered = null;
    expect(await getPushSubscriptionState(endpoint, "trushot")).toEqual({ registered: false, experienceMatches: false });
    expect(calls).toContainEqual(["website-push-subscriptions", "eq", "user_id", "verified-user"]);
    expect(calls.some(call => call[1] === "upsert")).toBe(false);
  });
  it("restricts test sends to the chosen app registration", async () => {
    await sendTestPushNotification(endpoint, "autopacific");
    expect(calls).toContainEqual(["website-push-subscriptions", "eq", "client_scope_id", "apg"]);
    expect(mocks.send).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ kind: "autopacific" }));
    calls = [];
    await sendTestPushNotification(endpoint, "trushot");
    expect(calls).toContainEqual(["website-push-subscriptions", "is", "client_scope_id", null]);
  });
  it("rejects invalid experience and endpoints before registering", async () => {
    await expect(savePushSubscription(subscription, "other" as "trushot")).rejects.toThrow();
    await expect(savePushSubscription({ ...subscription, endpoint: "http://invalid.test" }, "trushot")).rejects.toThrow();
    expect(calls.some(call => call[1] === "upsert")).toBe(false);
  });
});
