// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyAmbientVideo } from "./lazy-ambient-video";

describe("LazyAmbientVideo", () => {
  let container: HTMLDivElement;
  let root: Root;
  let notifyIntersection: IntersectionObserverCallback;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false } as MediaQueryList)));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notifyIntersection = callback; }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [];
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits until the video is near the viewport before assigning its source", async () => {
    await act(async () => root.render(<LazyAmbientVideo src="https://media.example/test.mp4" />));
    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.preload).toBe("none");

    await act(async () => notifyIntersection([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));

    expect(video.getAttribute("src")).toBe("https://media.example/test.mp4");
    expect(video.preload).toBe("metadata");
  });
});
