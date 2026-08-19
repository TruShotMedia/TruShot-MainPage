import { describe, expect, it } from "vitest";
import {
  getWebsiteMediaKind,
  validateWebsiteMediaFile,
  WEBSITE_MEDIA_ACCEPT,
} from "./website-media";

describe("website media", () => {
  it.each([
    ["image/jpeg", "image", "jpg"],
    ["image/png", "image", "png"],
    ["image/webp", "image", "webp"],
    ["image/avif", "image", "avif"],
    ["video/mp4", "video", "mp4"],
    ["video/webm", "video", "webm"],
  ] as const)("accepts %s as %s", (type, kind, extension) => {
    expect(validateWebsiteMediaFile({ type, size: 1024 })).toEqual({ kind, extension });
    expect(WEBSITE_MEDIA_ACCEPT).toContain(type);
  });

  it("rejects unsupported formats", () => {
    expect(getWebsiteMediaKind("image/gif")).toBeNull();
    expect(() => validateWebsiteMediaFile({ type: "video/quicktime", size: 1024 })).toThrow("Choose an MP4 or WebM video");
  });

  it("applies the correct size limit for each media kind", () => {
    expect(() => validateWebsiteMediaFile({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 })).toThrow("Images must be 10 MB or smaller");
    expect(() => validateWebsiteMediaFile({ type: "video/mp4", size: 80 * 1024 * 1024 + 1 })).toThrow("Videos must be 80 MB or smaller");
  });
});
