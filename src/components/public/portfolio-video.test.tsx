// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioVideo } from "./portfolio-video";

describe("PortfolioVideo sound controls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    container.remove();
  });

  it("gives the first video sound by default and a dedicated mute toggle", async () => {
    await act(async () => {
      root.render(<PortfolioVideo src="https://example.com/first.mp4" label="First portfolio video" soundEnabled />);
    });

    const video = container.querySelector("video")!;
    const muteButton = container.querySelector<HTMLButtonElement>('[aria-label="Mute video"]')!;
    expect(video.muted).toBe(false);
    expect(muteButton).toBeTruthy();

    await act(async () => muteButton.click());

    expect(video.muted).toBe(true);
    expect(container.querySelector('[aria-label="Unmute video"]')).toBeTruthy();
  });

  it("keeps subsequent videos muted without showing an audio toggle", async () => {
    await act(async () => {
      root.render(<PortfolioVideo src="https://example.com/later.mp4" label="Later portfolio video" />);
    });

    expect(container.querySelector("video")!.muted).toBe(true);
    expect(container.querySelector(".portfolio-video-sound-control")).toBeNull();
  });
});
