import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), factors: vi.fn(), signIn: vi.fn(), enroll: vi.fn(), verify: vi.fn(), unenroll: vi.fn(), claims: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/autopacific-mfa", () => ({ getAutopacificAccountContext: mocks.context, readAutopacificMfa: mocks.factors }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { beginAutopacificMfaSetup, cancelAutopacificMfaSetup, verifyAutopacificMfa } from "./mfa-actions";

const factorId = "11111111-2222-4333-8444-555555555555";
const factor = { id: factorId, factor_type: "totp", status: "unverified" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ claims: { sub: "apg-user", aal: "aal1" }, supabase: { auth: { signInWithPassword: mocks.signIn, getClaims: mocks.claims, mfa: { enroll: mocks.enroll, challengeAndVerify: mocks.verify, unenroll: mocks.unenroll } } } });
  mocks.factors.mockResolvedValue({ all: [factor], verified: [], totp: [] });
  mocks.signIn.mockResolvedValue({ data: { user: { id: "apg-user" } }, error: null });
  mocks.enroll.mockResolvedValue({ data: { id: factorId, totp: { qr_code: 'data:image/svg+xml;utf-8,<svg fill="#000"/>', secret: "TEST-ONLY-KEY" } }, error: null });
  mocks.verify.mockResolvedValue({ error: null });
  mocks.unenroll.mockResolvedValue({ error: null });
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "apg-user", aal: "aal2" } }, error: null });
});

describe("AutoPacific MFA enrollment", () => {
  it("requires the correct authenticated portal account before issuing a seed", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await beginAutopacificMfaSetup("test-password")).error).toContain("Sign in");
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("requires password confirmation, not just an unattended session", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: {} });
    expect((await beginAutopacificMfaSetup("bad-password")).error).toContain("password");
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("fixes the email on the server and returns only the QR setup data", async () => {
    const result = await beginAutopacificMfaSetup("test-password");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "jherholdt@autopac.com.au", password: "test-password" });
    expect(mocks.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: "totp", issuer: "AutoPacific MarketingTeamCRM" }));
    expect(result.enrollment?.qr).toContain("%23000");
    expect(result.enrollment?.id).toBe(factorId);
    expect(Object.keys(result.enrollment!)).toEqual(["id", "qr", "secret"]);
  });
  it("does not enroll an additional factor from a password-only session", async () => {
    mocks.factors.mockResolvedValue({ all: [factor], verified: [{ ...factor, status: "verified" }], totp: [factor] });
    expect((await beginAutopacificMfaSetup("test-password")).error).toContain("already enabled");
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("checks again after reauthentication in case another device completed setup", async () => {
    mocks.factors.mockResolvedValueOnce({ all: [factor], verified: [], totp: [] }).mockResolvedValueOnce({ all: [factor], verified: [factor], totp: [factor] });
    expect((await beginAutopacificMfaSetup("test-password")).error).toContain("already enabled");
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("replaces only abandoned, unverified setups created by this app", async () => {
    const abandoned = { ...factor, friendly_name: "AutoPacific Authenticator abandoned" };
    const unrelated = { ...factor, id: "different-factor", friendly_name: "Other app" };
    mocks.factors.mockResolvedValue({ all: [abandoned, unrelated], verified: [], totp: [] });
    expect((await beginAutopacificMfaSetup("test-password")).enrollment).toBeTruthy();
    expect(mocks.unenroll).toHaveBeenCalledExactlyOnceWith({ factorId });
  });
  it("fails closed if Auth cannot list factors", async () => {
    mocks.factors.mockResolvedValue(null);
    expect((await beginAutopacificMfaSetup("test-password")).error).toBeTruthy();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
});

describe("AutoPacific MFA verification", () => {
  it("verifies a six-digit code with leading zeros and restores the selected app", async () => {
    const result = await verifyAutopacificMfa({ factorId, code: "012345", next: "/marketing?view=calendar" });
    expect(result).toEqual({ ok: true, destination: "/marketing?view=calendar" });
    expect(mocks.verify).toHaveBeenCalledWith({ factorId, code: "012345" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/autopacific", "layout");
    expect(mocks.revalidate).toHaveBeenCalledWith("/marketing", "layout");
    expect(JSON.stringify(result)).not.toMatch(/access_token|refresh_token|secret|012345/);
  });
  it("does not accept a factor belonging to another account", async () => {
    mocks.factors.mockResolvedValue({ all: [], verified: [], totp: [] });
    expect((await verifyAutopacificMfa({ factorId, code: "012345" })).error).toBeTruthy();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("cannot bypass existing MFA by verifying a new, unverified factor", async () => {
    mocks.factors.mockResolvedValue({ all: [factor], verified: [{ id: "different-factor" }], totp: [] });
    expect((await verifyAutopacificMfa({ factorId, code: "012345" })).error).toContain("existing authenticator");
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("accepts an existing verified factor at login", async () => {
    const active = { ...factor, status: "verified" };
    mocks.factors.mockResolvedValue({ all: [active], verified: [active], totp: [active] });
    expect((await verifyAutopacificMfa({ factorId, code: "012345" })).ok).toBe(true);
  });
  it("validates input before contacting Auth", async () => {
    expect((await verifyAutopacificMfa({ factorId, code: "12abc3" })).error).toBeTruthy();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("returns a useful retry without leaking provider errors or continuing", async () => {
    mocks.verify.mockResolvedValue({ error: { message: "sensitive internal detail" } });
    const result = await verifyAutopacificMfa({ factorId, code: "012345" });
    expect(result.error).toContain("new code");
    expect(result).not.toHaveProperty("ok");
    expect(result.error).not.toContain("sensitive");
  });
  it("does not continue if the resulting session is still AAL1", async () => {
    mocks.claims.mockResolvedValue({ data: { claims: { aal: "aal1" } } });
    expect((await verifyAutopacificMfa({ factorId, code: "012345" })).error).toBeTruthy();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("cannot redirect to another application or an external URL", async () => {
    expect((await verifyAutopacificMfa({ factorId, code: "012345", next: "https://evil.test" })).destination).toBe("/autopacific");
  });
});

describe("AutoPacific MFA cancellation", () => {
  it("only removes an unverified setup owned by the signed-in account", async () => {
    expect(await cancelAutopacificMfaSetup(factorId)).toEqual({ ok: true });
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId });
  });
  it("can never disable an active authenticator", async () => {
    mocks.factors.mockResolvedValue({ all: [{ ...factor, status: "verified" }], verified: [factor], totp: [factor] });
    expect((await cancelAutopacificMfaSetup(factorId)).error).toContain("cannot be removed");
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it("cannot cancel setup when signed out", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await cancelAutopacificMfaSetup(factorId)).error).toContain("Sign in");
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
});
