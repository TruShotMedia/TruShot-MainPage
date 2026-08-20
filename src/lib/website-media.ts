export type WebsiteMediaKind = "image" | "video";

export const WEBSITE_MEDIA_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/mov": "mov",
  "video/x-quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const WEBSITE_MEDIA_ACCEPT = `${Object.keys(WEBSITE_MEDIA_EXTENSIONS).join(",")},.mov`;

export const WEBSITE_MEDIA_MAX_BYTES: Record<WebsiteMediaKind, number> = {
  image: 10 * 1024 * 1024,
  video: 80 * 1024 * 1024,
};

export function getWebsiteMediaKind(mimeType: string): WebsiteMediaKind | null {
  if (!(mimeType in WEBSITE_MEDIA_EXTENSIONS)) return null;
  return mimeType.startsWith("video/") ? "video" : "image";
}

export function validateWebsiteMediaFile(file: { type: string; size: number }) {
  const kind = getWebsiteMediaKind(file.type);
  if (!kind) {
    throw new Error("Choose an MP4, MOV or WebM video, or a JPG, PNG, WebP or AVIF image.");
  }
  if (file.size > WEBSITE_MEDIA_MAX_BYTES[kind]) {
    throw new Error(kind === "video" ? "Videos must be 80 MB or smaller." : "Images must be 10 MB or smaller.");
  }
  return { kind, extension: WEBSITE_MEDIA_EXTENSIONS[file.type] };
}
