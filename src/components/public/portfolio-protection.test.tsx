// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioProtection } from "./portfolio-protection";

describe("PortfolioProtection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
    container.remove();
  });

  it("blocks casual saving actions for portfolio media", async () => {
    await act(async () => {
      root.render(
        <main className="portfolio-page">
          <PortfolioProtection />
          <div className="portfolio-gallery"><div className="portfolio-media" /></div>
        </main>,
      );
    });

    const media = container.querySelector(".portfolio-media")!;
    const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    await act(async () => media.dispatchEvent(contextMenu));
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(container.querySelector(".portfolio-protection-notice")?.classList.contains("is-visible")).toBe(true);

    const dragStart = new Event("dragstart", { bubbles: true, cancelable: true });
    media.dispatchEvent(dragStart);
    expect(dragStart.defaultPrevented).toBe(true);

    const saveShortcut = new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(saveShortcut);
    expect(saveShortcut.defaultPrevented).toBe(true);
  });
});
