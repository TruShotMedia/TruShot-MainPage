// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */

import { act, type ImgHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioItem } from "@/lib/types";
import { PortfolioKioskPlayer } from "./portfolio-kiosk-player";

vi.mock("next/image", () => ({
  default: ({ priority, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    return <img alt={alt} {...props} />;
  },
}));

const items: PortfolioItem[] = [
  { id: "film-a", category_id: "category-a", media_kind: "video", alt_text: "First film", public_url: "https://example.com/first.mp4", poster_url: "https://example.com/first.jpg", poster_path: null, display_size: "wide" },
  { id: "film-b", category_id: "category-b", media_kind: "video", alt_text: "Second film", public_url: "https://example.com/second.mp4", poster_url: null, poster_path: null, display_size: "wide" },
];

describe("PortfolioKioskPlayer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("plays each film silently and advances when playback finishes", async () => {
    await act(async () => root.render(<PortfolioKioskPlayer items={items} />));

    let video = container.querySelector<HTMLVideoElement>("video")!;
    expect(video.src).toBe("https://example.com/first.mp4");
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0);
    expect(video.controls).toBe(false);
    expect(video.getAttribute("poster")).toBe("https://example.com/first.jpg");

    await act(async () => video.dispatchEvent(new Event("canplay", { bubbles: true })));
    expect(video.classList.contains("is-ready")).toBe(true);

    await act(async () => video.dispatchEvent(new Event("ended", { bubbles: true })));
    video = container.querySelector<HTMLVideoElement>("video")!;
    expect(video.src).toBe("https://example.com/second.mp4");
    expect(video.muted).toBe(true);
    expect(container.textContent).toContain("film 2 of 2");
  });

  it("loops a single film without exposing player controls", async () => {
    await act(async () => root.render(<PortfolioKioskPlayer items={[items[0]]} />));
    const video = container.querySelector<HTMLVideoElement>("video")!;

    expect(video.loop).toBe(true);
    expect(video.controls).toBe(false);
    expect(video.muted).toBe(true);
  });

  it("shows a branded empty state when no landscape films are available", async () => {
    await act(async () => root.render(<PortfolioKioskPlayer items={[]} />));
    expect(container.textContent).toContain("No landscape portfolio films are currently published.");
    expect(container.querySelector("video")).toBeNull();
  });

  it("skips a portrait video when its decoded dimensions disagree with stored metadata", async () => {
    await act(async () => root.render(<PortfolioKioskPlayer items={items} />));

    let video = container.querySelector<HTMLVideoElement>("video")!;
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1920 },
    });
    await act(async () => video.dispatchEvent(new Event("loadedmetadata", { bubbles: true })));

    video = container.querySelector<HTMLVideoElement>("video")!;
    expect(video.src).toBe("https://example.com/second.mp4");
    expect(container.textContent).toContain("film 1 of 1");
  });

  it("shows the empty state when stored metadata incorrectly marks the only portrait film as wide", async () => {
    await act(async () => root.render(<PortfolioKioskPlayer items={[items[0]]} />));

    const video = container.querySelector<HTMLVideoElement>("video")!;
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1920 },
    });
    await act(async () => video.dispatchEvent(new Event("loadedmetadata", { bubbles: true })));

    expect(container.querySelector("video")).toBeNull();
    expect(container.textContent).toContain("No landscape portfolio films are currently published.");
  });
});
