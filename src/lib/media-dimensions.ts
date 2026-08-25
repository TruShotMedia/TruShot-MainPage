"use client";

const DIMENSION_TIMEOUT_MS = 20_000;

export type MediaDimensions = {
  width: number;
  height: number;
};

/** Reads an uploaded image's intrinsic dimensions without sending it anywhere. */
export async function getImageDimensions(file: File): Promise<MediaDimensions> {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(file);
      try {
        return { width: bitmap.width, height: bitmap.height };
      } finally {
        bitmap.close();
      }
    } catch {
      // Some Safari codecs decode through Image even when createImageBitmap fails.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new window.Image();
  try {
    return await new Promise<MediaDimensions>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("The image took too long to prepare its portfolio layout."));
      }, DIMENSION_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(timeout);
        image.removeEventListener("load", handleLoad);
        image.removeEventListener("error", handleError);
      };
      const handleLoad = () => {
        cleanup();
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      const handleError = () => {
        cleanup();
        reject(new Error("This image format could not be measured in this browser."));
      };
      image.addEventListener("load", handleLoad, { once: true });
      image.addEventListener("error", handleError, { once: true });
      image.src = objectUrl;
    });
  } finally {
    image.removeAttribute("src");
    URL.revokeObjectURL(objectUrl);
  }
}
