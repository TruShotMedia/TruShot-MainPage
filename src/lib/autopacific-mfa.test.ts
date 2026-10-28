import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claims: vi.fn(), from: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims }, from: mocks.from }) }));
import { getAutopacificAccountContext } from "./autopacific-mfa";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "apg-user", email: "jherholdt@autopac.com.au", aal: "aal1" } } });
  mocks.membership.mockResolvedValue({ data: { id: "membership" } });
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.membership });
});
describe("MFA setup authorization", () => {
  it("allows the portal account to reach setup at AAL1", async () => {
    expect((await getAutopacificAccountContext())?.claims.sub).toBe("apg-user");
  });
  it("requires portal membership even for the expected email", async () => {
    mocks.membership.mockResolvedValue({ data: null });
    expect(await getAutopacificAccountContext()).toBeNull();
  });
  it("does not enroll the full CRM owner's account by mistake", async () => {
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "owner", email: "info@fearlessau.com" } } });
    mocks.membership.mockResolvedValue({ data: null });
    expect(await getAutopacificAccountContext()).toBeNull();
  });
  it("allows an individually enabled teammate to reach MFA setup", async () => {
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "teammate", email: "colleague@example.com", aal: "aal1" } } });
    expect((await getAutopacificAccountContext())?.claims.sub).toBe("teammate");
  });
  it("rejects unsigned or invalid sessions before looking up memberships", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: {} });
    expect(await getAutopacificAccountContext()).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
