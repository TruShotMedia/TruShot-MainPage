import { describe, expect, it } from "vitest";
import { ownsProfilePhoto, PROFILE_PHOTO_MAX_BYTES, profilePhotoUrl, validateProfilePhoto } from "./production-profile";

const workspace = "11111111-1111-4111-8111-111111111111", user = "d61eb1c9-8a31-4c49-81fd-93dd478493ce";
const photo = "10000000-1111-4111-8111-111111111111.webp";
const webp = new File(["RIFF0000WEBPdata"], "photo.webp", { type: "image/webp" });

describe("private profile photos", () => {
  it("accepts only a unique WebP path belonging to this workspace and user", () => {
    expect(ownsProfilePhoto(`${workspace}/${user}/${photo}`, workspace, user)).toBe(true);
    for (const path of [`${user}/${workspace}/${photo}`, `${workspace}/${user}/../${photo}`, `${workspace}/${user}/photo.svg`, `${workspace}/${user}/${photo}/other`]) {
      expect(ownsProfilePhoto(path, workspace, user)).toBe(false);
    }
  });
  it("validates size, MIME and file signature instead of trusting the extension", async () => {
    await expect(validateProfilePhoto(webp)).resolves.toHaveLength(16);
    await expect(validateProfilePhoto(new File(["not webp"], "fake.webp", { type: "image/webp" }))).rejects.toThrow("could not be read");
    await expect(validateProfilePhoto(new File(["<svg>"], "photo.webp", { type: "image/svg+xml" }))).rejects.toThrow();
    await expect(validateProfilePhoto(new File([], "empty.webp", { type: "image/webp" }))).rejects.toThrow();
    await expect(validateProfilePhoto(new File([new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1)], "large.webp", { type: "image/webp" }))).rejects.toThrow();
  });
  it("uses a stable same-origin authenticated endpoint with an encoded version", () => {
    expect(profilePhotoUrl(user, "2026-10-29T00:00:00+00:00")).toBe(`/api/autopacific/profile-photo/${user}?v=2026-10-29T00%3A00%3A00%2B00%3A00`);
  });
});
