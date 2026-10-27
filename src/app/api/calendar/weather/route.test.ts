import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ context: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/data/admin", () => ({ getAdminContext: mocks.context }));
beforeEach(() => vi.clearAllMocks());

describe("saved weather endpoint", () => {
  it("requires a CRM membership before reading weather history", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await GET(new Request("https://example.com/api/calendar/weather?start=2026-10-26&end=2026-11-01"))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects malformed and unbounded calendar requests", async () => {
    mocks.context.mockResolvedValue({ membership: { workspace_id: "workspace" }, supabase: { from: mocks.from } });
    for (const range of ["start=invalid&end=2026-11-01", "start=2026-10-26&end=2028-11-01", "start=2026-11-01&end=2026-10-26"]) expect((await GET(new Request(`https://example.com/api/calendar/weather?${range}`))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("scopes reads to the authenticated workspace and only returns saved forecasts", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.from.mockReturnValue(query);
    mocks.context.mockResolvedValue({ membership: { workspace_id: "workspace" }, supabase: { from: mocks.from } });
    const result = await GET(new Request("https://example.com/api/calendar/weather?start=2026-10-26&end=2026-11-01"));
    expect(result.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("workspace_id", "workspace");
    expect(query.gte).toHaveBeenCalledWith("week_start", "2026-10-20");
    expect(await result.json()).toEqual({ snapshots: [], location: "Brisbane City" });
  });
});
