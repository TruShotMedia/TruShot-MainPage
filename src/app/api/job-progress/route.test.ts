import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mock = vi.hoisted(() => ({ single: vi.fn(), rpc: vi.fn(), snapshot: vi.fn(), sign: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: mock.rpc }) }));
vi.mock("@/lib/job-progress-share-server", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/job-progress-share-server")>();
  return { ...original, readClientJobProgressSnapshot: mock.snapshot, signProgressAttachment: mock.sign };
});

const token = "11111111-0000-4000-8000-000000000001";
const file = "22222222-0000-4000-8000-000000000001";
const origin = "https://example.com";
const request = (body: unknown, from = origin) => new Request(`${origin}/api/job-progress`, {
  method: "POST", headers: { origin: from }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockReturnValue({ single: mock.single });
  mock.snapshot.mockResolvedValue({ title: "Shared job" });
});

describe("unlock shared progress", () => {
  it("rejects other origins, malformed PINs and oversized bodies before accessing the database", async () => {
    expect((await POST(request({ token, pin: "000123" }, "https://other.example"))).status).toBe(403);
    expect((await POST(request({ token, pin: "12345" }))).status).toBe(400);
    expect((await POST(request({ token, pin: "000123", file: "some/storage/path", action: "download" }))).status).toBe(400);
    expect((await POST(request({ token, pin: "000123", extra: "x".repeat(500) }))).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it.each([["denied", 403], ["limited", 429]])("doesn’t fetch job information when the request is %s", async (outcome, status) => {
    mock.single.mockResolvedValue({ data: { outcome }, error: null });
    const response = await POST(request({ token, pin: "000123" }));
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mock.snapshot).not.toHaveBeenCalled();
    const fileResponse = await POST(request({ token, pin: "000123", file, action: "download" }));
    expect(fileResponse.status).toBe(status);
    expect(mock.sign).not.toHaveBeenCalled();
  });

  it("accepts browser-verified same-origin requests behind a proxy but not cross-origin ones", async () => {
    mock.single.mockResolvedValue({ data: { outcome: "denied" }, error: null });
    const req = (site: string) => new Request(`${origin}/api/job-progress`, {
      method: "POST", headers: { origin: "https://proxy-facing.example", "sec-fetch-site": site }, body: JSON.stringify({ token, pin: "000123" }),
    });
    expect((await POST(req("cross-site"))).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
    await POST(req("same-origin"));
    expect(mock.rpc).toHaveBeenCalledOnce();
  });

  it("returns only the verified snapshot and preserves leading PIN zeroes", async () => {
    mock.single.mockResolvedValue({ data: { outcome: "verified", verified_job: "job-one" }, error: null });
    const response = await POST(request({ token, pin: "000123" }));
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("check_job_progress_pin", { p_token: token, p_pin: "000123" });
    expect(mock.snapshot).toHaveBeenCalledWith(expect.anything(), "job-one");
    expect(await response.json()).toEqual({ snapshot: { title: "Shared job" } });
  });

  it("signs a file only for the verified job and never caches the link", async () => {
    mock.single.mockResolvedValue({ data: { outcome: "verified", verified_job: "job-one" }, error: null });
    mock.sign.mockResolvedValueOnce("https://storage.example/signed?download=File.pdf").mockResolvedValueOnce(null);
    const response = await POST(request({ token, pin: "000123", file, action: "download" }));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ url: "https://storage.example/signed?download=File.pdf" });
    expect(mock.sign).toHaveBeenCalledWith(expect.anything(), "job-one", file, "download");
    expect((await POST(request({ token, pin: "000123", file, action: "view" }))).status).toBe(404);
    expect(mock.snapshot).not.toHaveBeenCalled();
  });
});
