import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), create: vi.fn(), revoke: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mocks.context }));
vi.mock("@/lib/calendar-subscription/service", () => ({ createSubscription: mocks.create, revokeSubscription: mocks.revoke, subscriptionStatus: mocks.status }));
import { GET, POST } from "./route";
const origin = "https://www.trushotmedia.com";
const request = (action: string, originHeader: string | null = origin) => new Request(`${origin}/api/calendar/subscription`, { method: "POST", headers: originHeader ? { origin: originHeader } : {}, body: JSON.stringify({ action, user_id: "attacker-chosen-owner" }) });
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ access: "autopacific", team: { role: "manager" }, claims: { sub: "verified-owner" }, supabase: {} }); mocks.status.mockResolvedValue({ enabled: false, rotated_at: null }); });
it("requires active authorised AutoPacific access, including the existing MFA guard", async () => {
  mocks.context.mockResolvedValue(null); expect((await GET()).status).toBe(401); expect((await POST(request("create"))).status).toBe(401);
  mocks.context.mockResolvedValue({ access: "autopacific", team: { role: "marketing" } }); expect((await POST(request("create"))).status).toBe(401);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each([null, "https://attacker.example"])("rejects cross-origin/missing-origin mutations %s", async value => {
  expect((await POST(request("create", value))).status).toBe(403); expect(mocks.context).not.toHaveBeenCalled();
});
it("takes the owner only from the verified session and requires explicit replacement", async () => {
  mocks.create.mockResolvedValue({ url: "PRIVATE-URL", rotated_at: "now" });
  const created = await POST(request("create")); expect(created.status).toBe(200);
  expect(mocks.create).toHaveBeenLastCalledWith("verified-owner", false);
  expect(created.headers.get("cache-control")).toContain("no-store");
  await POST(request("replace")); expect(mocks.create).toHaveBeenLastCalledWith("verified-owner", true);
  await POST(request("revoke")); expect(mocks.revoke).toHaveBeenCalledWith("verified-owner");
});
it("returns metadata only on GET and redacts failures", async () => {
  const response = await GET(); expect(await response.json()).toEqual({ enabled: false, rotated_at: null });
  mocks.create.mockRejectedValue(new Error("SECRET LINK FROM DATABASE"));
  const failed = await POST(request("create")); expect(failed.status).toBe(400); expect(await failed.text()).not.toContain("SECRET");
  expect((await POST(request("unknown"))).status).toBe(400);
});
