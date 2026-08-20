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
    ["video/quicktime", "video", "mov"],
    ["video/mov", "video", "mov"],
    ["video/x-quicktime", "video", "mov"],
  ] as const)("accepts %s as %s", (type, kind, extension) => {
    expect(validateWebsiteMediaFile({ type, size: 1024 })).toEqual({ kind, extension });
    expect(WEBSITE_MEDIA_ACCEPT).toContain(type);
  });

  it("rejects unsupported formats", () => {
    expect(getWebsiteMediaKind("image/gif")).toBeNull();
    expect(() => validateWebsiteMediaFile({ type: "video/avi", size: 1024 })).toThrow("Choose an MP4, MOV or WebM video");
  });

  it("includes the MOV extension in the native file picker filter", () => {
    expect(WEBSITE_MEDIA_ACCEPT.split(",")).toContain(".mov");
  });

  it("applies the correct size limit for each media kind", () => {
    expect(() => validateWebsiteMediaFile({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 })).toThrow("Images must be 10 MB or smaller");
    expect(validateWebsiteMediaFile({ type: "video/mp4", size: 200 * 1024 * 1024 })).toEqual({ kind: "video", extension: "mp4" });
    expect(() => validateWebsiteMediaFile({ type: "video/mp4", size: 200 * 1024 * 1024 + 1 })).toThrow("Videos must be 200 MB or smaller");
  });
});
