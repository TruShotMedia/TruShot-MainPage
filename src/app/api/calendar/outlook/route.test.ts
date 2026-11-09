import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), connect: vi.fn(), refresh: vi.fn(), disconnect: vi.fn(), statuses: vi.fn() }));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mocks.context }));
vi.mock("@/lib/outlook-calendar/service", () => ({ connectOutlookCalendar: mocks.connect, syncOutlookCalendar: mocks.refresh, disconnectOutlookCalendar: mocks.disconnect, getOutlookStatuses: mocks.statuses }));
import { GET, POST } from "./route";
const origin = "https://www.trushotmedia.com";
const request = (body: unknown, requestOrigin: string | null = origin) => new Request(`${origin}/api/calendar/outlook`, { method: "POST", headers: requestOrigin ? { origin: requestOrigin } : {}, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ claims: { sub: "verified-owner" }, supabase: {} }); mocks.statuses.mockResolvedValue([]); });
it("requires an authorised session", async () => {
  mocks.context.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await POST(request({ action: "connect" }))).status).toBe(401);
});
it.each([null, "https://attacker.example"])("rejects cross-origin and missing-origin mutations (%s)", async value => {
  expect((await POST(request({ action: "disconnect" }, value))).status).toBe(403);
  expect(mocks.disconnect).not.toHaveBeenCalled();
});
it("takes owner identity from the verified session, never from the body", async () => {
  const result = await POST(request({ action: "connect", name: "Work", url: "private-link", user_id: "victim" }));
  expect(result.status).toBe(200);
  expect(mocks.connect).toHaveBeenCalledWith("verified-owner", { name: "Work", url: "private-link" });
  expect(await result.text()).not.toContain("private-link");
  expect(result.headers.get("cache-control")).toContain("no-store");
});
it("redacts unexpected errors", async () => {
  mocks.connect.mockRejectedValue(new Error("db rejected SECRET-FEED-URL"));
  const result = await POST(request({ action: "connect", name: "Work", url: "private-link" }));
  expect(result.status).toBe(400);
  expect(await result.text()).not.toContain("SECRET");
});
it("validates actions and enforces refresh cooldowns", async () => {
  expect((await POST(request({ action: "other" }))).status).toBe(400);
  mocks.refresh.mockResolvedValue({ status: "busy" });
  expect((await POST(request({ action: "refresh", id: "11111111-1111-4111-8111-111111111111" }))).status).toBe(429);
});
