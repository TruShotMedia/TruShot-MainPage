import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), membership: vi.fn(), query: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut }, from: mocks.query }) }));
import { signInToAutopacific } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.membership };
  mocks.query.mockReturnValue(query);
  mocks.signIn.mockResolvedValue({ data: { user: { id: "work-user" } }, error: null });
  mocks.membership.mockResolvedValue({ data: { id: "membership" } });
});

describe("AutoPacific password-only sign in", () => {
  it("returns to Marketing using the same fixed account", async () => {
    const form = new FormData(); form.set("password", "example-password"); form.set("surface", "marketing"); form.set("next", "/marketing?view=planning");
    await expect(signInToAutopacific(form)).rejects.toThrow("REDIRECT:/marketing?view=planning");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "jherholdt@autopac.com.au", password: "example-password" });
  });
  it("uses the fixed server account even if an email is injected", async () => {
    const form = new FormData();
    form.set("password", "example-password"); form.set("email", "someone@else.test"); form.set("next", "/autopacific/mobile?view=jobs");
    await expect(signInToAutopacific(form)).rejects.toThrow("REDIRECT:/autopacific/mobile?view=jobs");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "jherholdt@autopac.com.au", password: "example-password" });
  });
  it("signs out a valid login without active portal membership", async () => {
    mocks.membership.mockResolvedValue({ data: null });
    const form = new FormData(); form.set("password", "example-password");
    await expect(signInToAutopacific(form)).rejects.toThrow("error=access");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it("does not contact Auth for an empty password", async () => {
    await expect(signInToAutopacific(new FormData())).rejects.toThrow("error=credentials");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
