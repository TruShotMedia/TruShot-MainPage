import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), upsert: vi.fn(), remove: vi.fn(), account: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.client }));
import { createSubscription, hashSubscriptionToken, readSubscription, revokeSubscription, subscriptionStatus } from "./service";
beforeEach(() => { vi.clearAllMocks(); mocks.account.mockResolvedValue({ data: { user: { id: "owner" } }, error: null }); mocks.client.mockReturnValue({ rpc: mocks.rpc, from: mocks.from, auth: { admin: { getUserById: mocks.account } } }); });
it("validates keys before database access and sends only a digest to the RPC", async () => {
  expect(await readSubscription("invalid")).toBeNull(); expect(mocks.client).not.toHaveBeenCalled();
  const token = "a".repeat(64); mocks.rpc.mockResolvedValue({ data: { owner_id: "owner", events: [] }, error: null });
  const result = await readSubscription(token);
  expect(mocks.rpc).toHaveBeenCalledWith("website-read-calendar-subscription", { p_token_hash: hashSubscriptionToken(token) });
  expect(result?.body).toContain("BEGIN:VCALENDAR"); expect(result?.body).not.toContain(token);
  expect(result?.etag).toMatch(/^"[a-f0-9]{64}"$/);
});
it("does not turn lookup failures or oversized feeds into empty calendars", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "unavailable" } }); await expect(readSubscription("a".repeat(64))).rejects.toThrow();
  mocks.rpc.mockResolvedValue({ data: { owner_id: "owner", events: Array(4001).fill({}) } }); await expect(readSubscription("a".repeat(64))).rejects.toThrow();
  mocks.rpc.mockResolvedValue({ data: null }); expect(await readSubscription("a".repeat(64))).toBeNull();
});
it("checks account status through Auth without granting direct access to auth.users", async () => {
  mocks.rpc.mockResolvedValue({ data: { owner_id: "owner", events: [] } });
  mocks.account.mockResolvedValue({ data: { user: { id: "owner", banned_until: "2099-01-01T00:00:00Z" } } });
  expect(await readSubscription("a".repeat(64))).toBeNull();
  mocks.account.mockResolvedValue({ data: { user: { id: "owner", deleted_at: "2026-11-10" } } });
  expect(await readSubscription("a".repeat(64))).toBeNull();
  mocks.account.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
  expect(await readSubscription("a".repeat(64))).toBeNull();
  mocks.account.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
  await expect(readSubscription("a".repeat(64))).rejects.toThrow();
});
it("stores random 256-bit token digests only; an existing link needs explicit replacement", async () => {
  mocks.insert.mockResolvedValue({ error: null }); mocks.upsert.mockResolvedValue({ error: null }); mocks.from.mockReturnValue({ insert: mocks.insert, upsert: mocks.upsert });
  const first = await createSubscription("verified-owner", false), second = await createSubscription("verified-owner", true);
  const token = new URL(first.url).searchParams.get("key")!;
  expect(token).toMatch(/^[a-f0-9]{64}$/); expect(first.url).not.toBe(second.url);
  const saved = mocks.insert.mock.calls[0][0]; expect(saved.user_id).toBe("verified-owner"); expect(saved.token_hash).toBe(hashSubscriptionToken(token));
  expect(JSON.stringify(saved)).not.toContain(token); expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "verified-owner" }), { onConflict: "workspace_id,user_id" });
});
it("owner-scopes revocation and metadata reads, and never selects the token digest", async () => {
  const query = { eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) }; query.eq.mockReturnValue(query);
  const select = vi.fn().mockReturnValue(query), remove = vi.fn().mockReturnValue(query);
  mocks.from.mockReturnValue({ delete: remove });
  await revokeSubscription("owner"); expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
  const result = await subscriptionStatus({ from: () => ({ select }) } as never, "owner");
  expect(select).toHaveBeenCalledWith("id,rotated_at"); expect(result.enabled).toBe(false);
});
