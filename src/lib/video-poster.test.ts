// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoPoster } from "./video-poster";

describe("createVideoPoster", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("captures and scales an early video frame into a JPEG", async () => {
    const originalCreateElement = document.createElement.bind(document);
    const video = originalCreateElement("video");
    const canvas = originalCreateElement("canvas");
    const drawImage = vi.fn();

    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 },
      duration: { configurable: true, value: 10 },
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
      currentTime: {
        configurable: true,
        get: () => 0.8,
        set: () => globalThis.setTimeout(() => video.dispatchEvent(new Event("seeked")), 0),
      },
    });
    vi.spyOn(video, "load").mockImplementation(() => {
      globalThis.setTimeout(() => video.dispatchEvent(new Event("loadedmetadata")), 0);
    });
    vi.spyOn(canvas, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => callback(new Blob(["poster"], { type: "image/jpeg" })));
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "video") return video;
      if (tagName === "canvas") return canvas;
      return originalCreateElement(tagName);
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:portfolio-video"),
      revokeObjectURL: vi.fn(),
    });

    const poster = await createVideoPoster(new File(["video"], "film.mov", { type: "video/quicktime" }));

    expect(poster.type).toBe("image/jpeg");
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:portfolio-video");
  });
});
