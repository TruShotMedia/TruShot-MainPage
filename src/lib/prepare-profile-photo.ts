import { PROFILE_PHOTO_MAX_BYTES } from "./production-profile";

export const PROFILE_PHOTO_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
type PreparationOptions = { signal?: AbortSignal; onProgress?: (message: string) => void };
type DecodedPhoto = { source: CanvasImageSource; width: number; height: number; release: () => void };

function cancelled() { return new DOMException("Photo preparation cancelled.", "AbortError"); }
function check(signal?: AbortSignal) { if (signal?.aborted) throw cancelled(); }

async function isPhonePhoto(file: File) {
  if (/image\/hei[cf]|\.hei[cf]$/i.test(`${file.type} ${file.name}`)) return true;
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const brands = String.fromCharCode(...header);
  return brands.slice(4, 8) === "ftyp" && /heic|heix|hevc|hevx|mif1|msf1/.test(brands.slice(8));
}

/** A separate, lazy worker keeps HEIC decoding off the UI thread and cancellable. */
async function decodePhonePhoto(file: File, signal?: AbortSignal): Promise<DecodedPhoto> {
  check(signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./profile-photo-heic.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timeout); signal?.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { finish(); reject(cancelled()); };
    const timeout = setTimeout(() => { finish(); reject(new Error("This phone photo is taking too long to open. Try choosing it again, or use a JPG copy.")); }, 60_000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ bitmap?: ImageBitmap; error?: string }>) => {
      finish();
      if (data.bitmap) {
        const bitmap = data.bitmap;
        resolve({ source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() });
      } else reject(new Error(data.error || "This phone photo could not be opened. Try a JPG copy."));
    };
    worker.onerror = () => { finish(); reject(new Error("This phone photo could not be opened. Try updating your browser, or choose a JPG copy.")); };
    worker.postMessage(file);
  });
}

async function decodeNative(file: File, signal?: AbortSignal): Promise<DecodedPhoto> {
  check(signal);
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { resizeWidth: 1024, resizeQuality: "high", imageOrientation: "from-image" });
      if (signal?.aborted) { bitmap.close(); throw cancelled(); }
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch (error) { check(signal); if (error instanceof DOMException && error.name === "AbortError") throw error; }
  }
  const url = URL.createObjectURL(file), image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = () => { clearTimeout(timeout); signal?.removeEventListener("abort", abort); image.onload = image.onerror = null; };
      const abort = () => { finish(); image.src = ""; reject(cancelled()); };
      const timeout = setTimeout(() => { finish(); reject(new Error("This photo took too long to open. Please choose it again.")); }, 20_000);
      signal?.addEventListener("abort", abort, { once: true });
      image.onload = () => { finish(); resolve(); };
      image.onerror = () => { finish(); reject(new Error("This photo could not be opened. Choose a JPG, PNG, WebP or HEIC photo.")); };
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.src = ""; URL.revokeObjectURL(url); } };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
}

/** Only a small, re-rendered image leaves the device, never the camera original or its EXIF. */
export async function prepareProfilePhoto(file: File, options: PreparationOptions = {}): Promise<File> {
  const { signal, onProgress } = options;
  check(signal);
  if (!file.size || file.size > PROFILE_PHOTO_SOURCE_MAX_BYTES || /svg/i.test(file.type + file.name)) {
    throw new Error("Choose a JPG, PNG, WebP or HEIC/HEIF photo under 50 MB.");
  }
  const phonePhoto = await isPhonePhoto(file);
  if (!phonePhoto && !file.type.startsWith("image/") && !/\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(file.name)) {
    throw new Error("Choose a JPG, PNG, WebP or HEIC/HEIF photo under 50 MB.");
  }
  onProgress?.("Opening photo…");
  let photo: DecodedPhoto;
  try { photo = await decodeNative(file, signal); }
  catch (error) {
    check(signal);
    if (!phonePhoto) throw error;
    onProgress?.("Preparing iPhone photo…");
    photo = await decodePhonePhoto(file, signal);
  }
  const canvas = document.createElement("canvas");
  try {
    check(signal);
    if (!photo.width || !photo.height) throw new Error("This image is empty. Choose another photo.");
    onProgress?.("Sizing your profile photo…");
    const crop = Math.min(photo.width, photo.height);
    for (const dimension of [512, 384, 256]) {
      canvas.width = canvas.height = dimension;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo preparation is unavailable in this browser.");
      context.drawImage(photo.source, (photo.width - crop) / 2, (photo.height - crop) / 2, crop, crop, 0, 0, dimension, dimension);
      // Safari may return PNG when WebP encoding is unavailable. Honour the actual MIME.
      for (const [type, quality] of [["image/webp", .82], ["image/jpeg", .85], ["image/jpeg", .65]] as const) {
        check(signal);
        const blob = await encode(canvas, type, quality);
        check(signal);
        const extension = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" }[blob?.type ?? ""];
        if (blob?.size && blob.size <= PROFILE_PHOTO_MAX_BYTES && extension) {
          return new File([blob], `profile.${extension}`, { type: blob.type });
        }
      }
    }
    throw new Error("This photo could not be resized. Please try another photo.");
  } finally { photo.release(); canvas.width = canvas.height = 1; }
}
