import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), team: vi.fn(), user: vi.fn(), previous: vi.fn(), upsert: vi.fn(), upload: vi.fn(), remove: vi.fn(), eq: vi.fn() }));
vi.mock("./admin", () => ({ getProductionContext: mocks.context }));
vi.mock("./production-team", () => ({ getProductionTeam: mocks.team }));
import { getMyAccount, updateMyPhoto } from "./production-profile";

const workspace = "11111111-1111-4111-8111-111111111111", user = "d61eb1c9-8a31-4c49-81fd-93dd478493ce";
const previous = `${workspace}/${user}/10000000-1111-4111-8111-111111111111.webp`;
beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(), maybeSingle: mocks.previous, upsert: mocks.upsert };
  mocks.context.mockResolvedValue({ supabase: { from: () => query, storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) }, auth: { getUser: mocks.user } }, claims: { sub: user, aal: "aal2" }, access: "autopacific", membership: { display_name: "John" } });
  mocks.team.mockResolvedValue({ userId: user, role: "manager", selfAvatarUrl: "/private-photo", members: [{ user_id: user, display_name: "John", username: "john" }] });
  mocks.user.mockResolvedValue({ data: { user: { id: user, email: "john@example.test", created_at: "2026-10-29", factors: [{ status: "verified" }], app_metadata: { secret: "not a client field" } } } });
  mocks.previous.mockResolvedValue({ data: { avatar_path: previous }, error: null });
  mocks.upsert.mockResolvedValue({ error: null }); mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
});
const photo = () => new File(["RIFF0000WEBPdata"], "photo.webp", { type: "image/webp" });
describe("my account data boundary", () => {
  it("returns only current-user account facts, not Auth metadata", async () => {
    const account = await getMyAccount();
    expect(account).toMatchObject({ userId: user, displayName: "John", username: "john", mfaEnabled: true, verifiedSession: true });
    expect(account).not.toHaveProperty("app_metadata");
  });
  it("blocks account reads and writes without verified workspace access", async () => {
    mocks.context.mockResolvedValue(null);
    await expect(getMyAccount()).rejects.toThrow("Sign in again");
    await expect(updateMyPhoto(photo())).rejects.toThrow("Sign in again");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("derives ownership from the session and replaces the old object only after saving", async () => {
    const result = await updateMyPhoto(photo());
    const path = mocks.upload.mock.calls[0][0];
    expect(path).toMatch(new RegExp(`^${workspace}/${user}/.+\\.webp$`));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: workspace, user_id: user, avatar_path: path }), { onConflict: "workspace_id,user_id" });
    expect(mocks.remove).toHaveBeenCalledWith([previous]);
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.upsert.mock.invocationCallOrder[0]);
    expect(result.avatarUrl).toContain(`/api/autopacific/profile-photo/${user}?v=`);
  });
  it("does not update profile or remove the previous photo if upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "Storage unavailable" } });
    await expect(updateMyPhoto(photo())).rejects.toThrow("could not be uploaded");
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("cleans up the new object if the profile write fails, preserving the original", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "Write failed" } });
    await expect(updateMyPhoto(photo())).rejects.toThrow("could not be saved");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]]);
  });
  it("removes the current user's photo without uploading or changing membership", async () => {
    expect(await updateMyPhoto(null)).toEqual({ avatarUrl: null });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: user, avatar_path: null }), expect.anything());
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalledWith([previous]);
  });
  it("never deletes a path belonging to another account", async () => {
    mocks.previous.mockResolvedValue({ data: { avatar_path: `${workspace}/another-user/photo.webp` } });
    await updateMyPhoto(null); expect(mocks.remove).not.toHaveBeenCalled();
  });
});
