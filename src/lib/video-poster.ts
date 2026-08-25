"use client";

const POSTER_MAX_WIDTH = 1280;
const POSTER_TIMEOUT_MS = 20_000;

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to prepare a thumbnail."));
    }, POSTER_TIMEOUT_MS);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This video format could not be decoded for a thumbnail in this browser."));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

/** Captures an early representative video frame as a compact JPEG poster. */
export async function createVideoPoster(source: File | string) {
  const video = document.createElement("video");
  const objectUrl = source instanceof File ? URL.createObjectURL(source) : null;
  if (typeof source === "string") video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    const metadataReady = waitForVideoEvent(video, "loadedmetadata");
    video.src = typeof source === "string" ? source : objectUrl!;
    video.load();
    await metadataReady;
    if (!video.videoWidth || !video.videoHeight) {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitForVideoEvent(video, "loadeddata");
      if (!video.videoWidth || !video.videoHeight) throw new Error("The video did not expose a frame for its thumbnail.");
    }
    if (Number.isFinite(video.duration) && video.duration > 0.2) {
      const frameReady = waitForVideoEvent(video, "seeked");
      video.currentTime = Math.min(1, Math.max(0.08, video.duration * 0.08));
      await frameReady;
    }

    const scale = Math.min(1, POSTER_MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the video thumbnail.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (!blob) throw new Error("Your browser could not save the video thumbnail.");
    return new File([blob], "portfolio-video-thumbnail.jpg", { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
