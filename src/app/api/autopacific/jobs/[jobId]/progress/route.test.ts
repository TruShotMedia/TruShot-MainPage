import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const mock = vi.hoisted(() => ({ context: vi.fn(), snapshot: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mock.context }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: mock.from, rpc: mock.rpc }) }));
vi.mock("@/lib/job-progress-share-server", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/job-progress-share-server")>();
  return { ...original, readJobProgressSnapshot: mock.snapshot };
});

const jobId = "11111111-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ jobId }) };
const url = `https://example.com/api/autopacific/jobs/${jobId}/progress`;
const share = () => new Request(url, { method: "POST", body: '{"action":"share"}', headers: { origin: "https://example.com" } });

function authorised(role: string, jobExists = true) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: jobExists ? { id: jobId } : null });
  const builder = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), maybeSingle };
  const supabase = { from: vi.fn(() => builder) };
  mock.context.mockResolvedValue({ access: "autopacific", team: { role }, supabase, membership: { workspace_id: "workspace" } });
  return { supabase, builder };
}

beforeEach(() => { vi.resetAllMocks(); });

describe("private job progress actions", () => {
  it("blocks unauthenticated and marketing-only requests and jobs hidden by RLS", async () => {
    mock.context.mockResolvedValue(null);
    expect((await GET(new Request(url), context)).status).toBe(401);
    authorised("marketing");
    expect((await POST(share(), context)).status).toBe(403);
    authorised("videographer", false);
    expect((await POST(share(), context)).status).toBe(404);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("checks workspace scope before enabling a job link", async () => {
    const { builder } = authorised("videographer");
    mock.rpc.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { pin: "012345", token: jobId, enabled: true } }) });
    const response = await POST(share(), context);
    expect(response.status).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith("workspace_id", "workspace");
    expect(mock.rpc).toHaveBeenCalledWith("enable_job_progress_share", { p_job: jobId });
    expect(await response.json()).toEqual({ pin: "012345", token: jobId, enabled: true });
  });

  it("does not activate or load share credentials when downloading the PNG", async () => {
    const { supabase } = authorised("manager");
    mock.snapshot.mockResolvedValue({ title: "Example job" });
    const response = await GET(new Request(url + "?format=snapshot"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ snapshot: { title: "Example job" } });
    expect(mock.snapshot).toHaveBeenCalledWith(supabase, jobId);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
