import "server-only";
import sharp from "sharp";
import { PROFILE_PHOTO_MAX_BYTES, validateProfilePhoto } from "@/lib/production-profile";

/** Recheck and decode untrusted prepared bytes; the private bucket stays WebP-only. */
export async function normalizeProfilePhoto(file: File): Promise<Uint8Array> {
  const input = await validateProfilePhoto(file);
  try {
    const output = await sharp(input, { limitInputPixels: 4_194_304, failOn: "warning", animated: false })
      .autoOrient().resize(512, 512, { fit: "cover", withoutEnlargement: true })
      .toColourspace("srgb").webp({ quality: 82, effort: 3 }).toBuffer();
    if (!output.length || output.length > PROFILE_PHOTO_MAX_BYTES) throw new Error("Image too large");
    return output;
  } catch {
    throw new Error("This photo could not be read. Choose another photo and try again.");
  }
}
