import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claims: vi.fn(), from: vi.fn(), admin: vi.fn(), portal: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims }, from: mocks.from }) }));
import { getAdminContext, getProductionContext } from "./admin";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "work-user" } } });
  mocks.admin.mockResolvedValue({ data: null });
  mocks.portal.mockResolvedValue({ data: null });
  mocks.from.mockImplementation((table: string) => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: table === "website-admin-users" ? mocks.admin : mocks.portal }));
});

describe("production versus full CRM authorization", () => {
  it("allows operational portal access without creating an admin context", async () => {
    mocks.portal.mockResolvedValue({ data: { id: "portal", workspace_id: "workspace", display_name: "John" } });
    expect((await getProductionContext())?.access).toBe("autopacific");
    expect(await getAdminContext()).toBeNull();
  });
  it("does not admit a signed-in user without active membership", async () => {
    expect(await getProductionContext()).toBeNull();
  });
  it("keeps existing administrator access and avoids a portal lookup", async () => {
    mocks.admin.mockResolvedValue({ data: { id: "admin", workspace_id: "workspace", display_name: "Owner", role: "owner" } });
    expect((await getProductionContext())?.access).toBe("admin");
    expect(mocks.portal).not.toHaveBeenCalled();
  });
  it("does not query memberships without verified claims", async () => {
    mocks.claims.mockResolvedValue({ data: null });
    expect(await getProductionContext()).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
