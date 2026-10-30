import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeProfilePhoto } from "./normalize-profile-photo";

describe("private avatar normalization", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodes real %s input and stores a bounded, metadata-free WebP", async format => {
    const source = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#609abb" } }).withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
    const bytes = await normalizeProfilePhoto(new File([new Uint8Array(source)], `prepared.${format}`, { type: `image/${format}` }));
    const result = await sharp(bytes).metadata();
    expect(result.format).toBe("webp"); expect(result.width).toBe(512); expect(result.height).toBe(512);
    expect(result.exif).toBeUndefined(); expect(result.orientation).toBeUndefined(); expect(bytes.length).toBeLessThan(512 * 1024);
  });
  it("rejects corrupt files even when the signature looks valid", async () => {
    await expect(normalizeProfilePhoto(new File(["RIFF0000WEBPdata"], "fake.webp", { type: "image/webp" }))).rejects.toThrow("could not be read");
  });
  it("rejects a MIME/signature mismatch and original HEIC before storage", async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "red" } }).png().toBuffer();
    await expect(normalizeProfilePhoto(new File([new Uint8Array(png)], "fake.webp", { type: "image/webp" }))).rejects.toThrow();
    await expect(normalizeProfilePhoto(new File(["heic"], "original.heic", { type: "image/heic" }))).rejects.toThrow();
  });
  it("bounds decoded pixels even if a highly compressed file is small", async () => {
    const png = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: "red" } }).png().toBuffer();
    await expect(normalizeProfilePhoto(new File([new Uint8Array(png)], "large.png", { type: "image/png" }))).rejects.toThrow("could not be read");
  });
});
