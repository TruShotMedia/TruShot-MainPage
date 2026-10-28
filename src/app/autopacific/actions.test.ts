import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), membership: vi.fn(), factors: vi.fn(), signOut: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (destination: string) => { throw new Error(`REDIRECT ${destination}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/autopacific-mfa", () => ({ readAutopacificMfa: mocks.factors }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut }, from: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.membership }) }) }));
import { signInToAutopacific } from "./actions";
const form = () => { const data = new FormData(); data.set("email", "jherholdt@autopac.com.au"); data.set("password", "test-password"); data.set("surface", "marketing"); data.set("next", "/marketing?view=calendar"); return data; };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signIn.mockResolvedValue({ data: { user: { id: "apg-user" } }, error: null });
  mocks.membership.mockResolvedValue({ data: { id: "membership" } });
  mocks.factors.mockResolvedValue({ all: [], verified: [], totp: [] });
});
describe("AutoPacific password login with MFA", () => {
  it("does not force unenrolled users into a dead-end challenge", async () => {
    await expect(signInToAutopacific(form())).rejects.toThrow("REDIRECT /marketing?view=calendar");
  });
  it("requires the authenticator before opening either workspace", async () => {
    mocks.factors.mockResolvedValue({ verified: [{ id: "factor" }] });
    await expect(signInToAutopacific(form())).rejects.toThrow("REDIRECT /autopacific/security?next=%2Fmarketing%3Fview%3Dcalendar");
  });
  it("fails closed if the factor status cannot be checked", async () => {
    mocks.factors.mockResolvedValue(null);
    await expect(signInToAutopacific(form())).rejects.toThrow("/marketing/login?error=verification");
  });
  it("does not admit the account without active portal membership", async () => {
    mocks.membership.mockResolvedValue({ data: null });
    await expect(signInToAutopacific(form())).rejects.toThrow("/marketing/login?error=access");
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.factors).not.toHaveBeenCalled();
  });
});

describe("AutoPacific individual-account password stage", () => {
  it("returns to Marketing using the person's account", async () => {
    const data = form(); data.set("password", "example-password"); data.set("next", "/marketing?view=planning");
    await expect(signInToAutopacific(data)).rejects.toThrow("REDIRECT /marketing?view=planning");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "jherholdt@autopac.com.au", password: "example-password" });
  });
  it("uses the supplied email but still requires enabled membership", async () => {
    const data = new FormData(); data.set("password", "example-password"); data.set("email", "someone@else.test"); data.set("next", "/autopacific/mobile?view=jobs");
    await expect(signInToAutopacific(data)).rejects.toThrow("REDIRECT /autopacific/mobile?view=jobs");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "someone@else.test", password: "example-password" });
  });
  it("signs out a valid login without active portal membership", async () => {
    mocks.membership.mockResolvedValue({ data: null });
    const data = form(); data.set("password", "example-password");
    await expect(signInToAutopacific(data)).rejects.toThrow("error=access");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it("does not contact Auth for an empty password", async () => {
    await expect(signInToAutopacific(new FormData())).rejects.toThrow("error=credentials");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("rejects a missing or invalid email before contacting Auth", async () => {
    const data = form(); data.delete("email");
    await expect(signInToAutopacific(data)).rejects.toThrow("error=credentials");
    data.set("email", "not-an-email");
    await expect(signInToAutopacific(data)).rejects.toThrow("error=credentials");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
