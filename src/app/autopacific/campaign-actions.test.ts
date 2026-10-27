import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadProductionCampaigns, saveProductionCampaign } from "./campaign-actions";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), from: vi.fn(), revalidate: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mocks.context }));
vi.mock("@/lib/clickup/job-sync", () => ({ scheduleClickUpJobSync: mocks.sync }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const plan = { id: id(1), title: "Launch campaign", start_date: "2026-12-01", objective: null, notes: null, updated_at: null, weeks: [{ id: id(2), title: "Week one", jobs: [{ id: id(3), title: "Launch film", status_id: id(4), shoot_date: null, due_date: null, description: null, location: null, updated_at: null, deliverables: [], tasks: [] }] }] };
describe("production campaign actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: plan.id, error: null });
    mocks.from.mockImplementation((table: string) => {
      const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: { id: id(9) }, error: null })),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: table === "website-campaigns" ? [] : [], error: null })),
      }; return query;
    });
    mocks.context.mockResolvedValue({ supabase: { from: mocks.from, rpc: mocks.rpc }, access: "autopacific" });
  });
  it("uses the caller's authenticated client-scoped transaction and existing ClickUp sync", async () => {
    expect(await saveProductionCampaign(plan)).toEqual({ ok: true, id: plan.id });
    expect(mocks.rpc).toHaveBeenCalledWith("website-save-campaign-plan", expect.objectContaining({ p_client_id: id(9), p_plan: expect.objectContaining({ id: plan.id }) }));
    const payload = mocks.rpc.mock.calls[0][1].p_plan;
    expect(payload.weeks[0].jobs[0]).not.toHaveProperty("tasks");
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(mocks.revalidate).toHaveBeenCalledWith("/marketing");
  });
  it("rejects unauthenticated callers without writing or scheduling external sync", async () => {
    mocks.context.mockResolvedValue(null);
    expect(await saveProductionCampaign(plan)).toMatchObject({ ok: false, error: expect.stringContaining("session has expired") });
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("does not report success or dispatch sync on transaction failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "A job changed elsewhere" } });
    expect(await saveProductionCampaign(plan)).toEqual({ ok: false, error: "A job changed elsewhere" });
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("does not fetch week/job detail when no campaigns exist", async () => {
    expect(await loadProductionCampaigns()).toEqual([]);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["website-clients", "website-campaigns"]);
  });
});
