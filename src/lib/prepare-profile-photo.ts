import { PROFILE_PHOTO_MAX_BYTES } from "./production-profile";

/** Decode locally: the original photo and its EXIF never leave the device. */
export async function prepareProfilePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024 || file.type === "image/svg+xml") {
    throw new Error("Choose a JPG, PNG, WebP or supported phone photo under 15 MB.");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error("This photo could not be opened. Try a JPG, PNG or WebP image.")); image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("This image is empty. Choose another photo.");
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo preparation is unavailable in this browser.");
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .82));
    if (!blob || blob.type !== "image/webp" || blob.size > PROFILE_PHOTO_MAX_BYTES) throw new Error("This photo could not be prepared. Try a different image.");
    return new File([blob], "profile.webp", { type: "image/webp" });
  } finally { URL.revokeObjectURL(url); }
}
