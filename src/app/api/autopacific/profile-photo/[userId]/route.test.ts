import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claims: vi.fn(), profile: vi.fn(), download: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims },
  from: mocks.from, storage: { from: () => ({ download: mocks.download }) } }) }));
import { GET } from "./route";
const user = "d61eb1c9-8a31-4c49-81fd-93dd478493ce";
const request = () => GET(new Request("https://example.test/photo"), { params: Promise.resolve({ userId: user }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({ data: { claims: { sub: user } } });
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.profile });
  mocks.profile.mockResolvedValue({ data: { avatar_path: `11111111-1111-4111-8111-111111111111/${user}/10000000-1111-4111-8111-111111111111.webp` } });
  mocks.download.mockResolvedValue({ data: new Blob(["webp"], { type: "image/webp" }) });
});
describe("private avatar endpoint", () => {
  it("does not expose a profile without an authenticated session", async () => {
    mocks.claims.mockResolvedValue({ data: null });
    expect((await request()).status).toBe(404); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not download a missing/RLS-hidden profile", async () => {
    mocks.profile.mockResolvedValue({ data: null });
    expect((await request()).status).toBe(404); expect(mocks.download).not.toHaveBeenCalled();
  });
  it("rejects malformed paths and prevents shared CDN caching", async () => {
    mocks.profile.mockResolvedValue({ data: { avatar_path: "another-account/photo.webp" } });
    expect((await request()).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("serves through the caller's private storage session, with short private caching", async () => {
    const response = await request();
    expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(response.headers.get("Vary")).toBe("Cookie"); expect(await response.text()).toBe("webp");
  });
});
