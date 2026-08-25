// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */

import { act, type ImgHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioItem } from "@/lib/types";
import { PortfolioGallery } from "./portfolio-gallery";

vi.mock("next/image", () => ({
  default: ({ fill, priority, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    void fill;
    void priority;
    return <img alt={alt} {...props} />;
  },
}));

const items: PortfolioItem[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    category_id: "33333333-3333-4333-8333-333333333333",
    media_kind: "image",
    alt_text: "Campaign still",
    public_url: "https://example.com/still.jpg",
    poster_url: null,
    poster_path: null,
    display_size: "wide",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    category_id: "33333333-3333-4333-8333-333333333333",
    media_kind: "video",
    alt_text: "Campaign film",
    public_url: "https://example.com/film.mp4",
    poster_url: "https://example.com/film-poster.jpg",
    poster_path: "workspace/portfolio/posters/film-poster.jpg",
    display_size: "standard",
  },
];

describe("PortfolioGallery full-screen viewer", () => {
  let container: HTMLDivElement;
  let root: Root;
  const requestFullscreen = vi.fn(async () => undefined);

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    requestFullscreen.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.querySelector(".portfolio-lightbox")?.remove();
    container.remove();
    vi.restoreAllMocks();
  });

  it("opens a selected item, navigates to video, and closes with Escape", async () => {
    await act(async () => {
      root.render(<PortfolioGallery items={items} firstVideoId={items[1].id} priorityFirst />);
    });

    const openButton = container.querySelector<HTMLButtonElement>('[aria-label="View Campaign still full screen"]')!;
    await act(async () => openButton.click());

    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.querySelector<HTMLImageElement>('.portfolio-lightbox-media img')?.alt).toBe("Campaign still");

    const nextButton = document.querySelector<HTMLButtonElement>('[aria-label="View next portfolio item"]')!;
    await act(async () => nextButton.click());

    const lightboxVideo = document.querySelector<HTMLVideoElement>('.portfolio-lightbox-media video')!;
    expect(lightboxVideo.getAttribute("src")).toBe("https://example.com/film.mp4");
    expect(lightboxVideo.getAttribute("poster")).toBe("https://example.com/film-poster.jpg");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("offers a dedicated native full-screen action", async () => {
    await act(async () => {
      root.render(<PortfolioGallery items={[items[0]]} />);
    });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="View Campaign still full screen"]')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Enter native full screen"]')!.click());

    expect(requestFullscreen).toHaveBeenCalledOnce();
  });
});
