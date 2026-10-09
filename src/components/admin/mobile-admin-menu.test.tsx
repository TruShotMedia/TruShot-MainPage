// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAdminMenu } from "./mobile-admin-menu";

vi.mock("@/components/admin/admin-navigation", () => ({
  AdminNavigation: ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav><a href="/admin/requests" onClick={(event) => { event.preventDefault(); onNavigate?.(); }}>Requests</a></nav>
  ),
}));

vi.mock("lucide-react", () => ({
  Menu: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  X: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

describe("MobileAdminMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<MobileAdminMenu />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function click(element: Element) {
    await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  async function pointer(element: Element, type: string, clientX: number, clientY = 100) {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: "touch" },
    });
    await act(async () => element.dispatchEvent(event));
  }

  it("opens and closes from the menu trigger", async () => {
    const trigger = container.querySelector<HTMLButtonElement>(".mobile-admin-menu-trigger")!;

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".mobile-admin-menu")?.classList.contains("is-open")).toBe(true);
  });

  it("closes when the backdrop is pressed", async () => {
    const trigger = container.querySelector<HTMLButtonElement>(".mobile-admin-menu-trigger")!;
    await click(trigger);
    await click(container.querySelector<HTMLButtonElement>(".mobile-admin-menu-backdrop")!);

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes after choosing a destination", async () => {
    const trigger = container.querySelector<HTMLButtonElement>(".mobile-admin-menu-trigger")!;
    await click(trigger);
    await click(container.querySelector<HTMLAnchorElement>('a[href="/admin/requests"]')!);

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when Escape is pressed", async () => {
    const trigger = container.querySelector<HTMLButtonElement>(".mobile-admin-menu-trigger")!;
    await click(trigger);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens with a swipe from the left edge", async () => {
    const edge = container.querySelector<HTMLElement>(".mobile-admin-menu-edge")!;
    const trigger = container.querySelector<HTMLButtonElement>(".mobile-admin-menu-trigger")!;

    await pointer(edge, "pointerdown", 1);
    await pointer(edge, "pointermove", 190, 102);
    await pointer(edge, "pointerup", 190, 102);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes with a left swipe and prevents background scrolling while open", async () => {
    const trigger = container.querySelector<HTMLButtonElement>(".mobile-admin-menu-trigger")!;
    await click(trigger);
    expect(document.body.style.overflow).toBe("hidden");

    const panel = container.querySelector<HTMLElement>(".mobile-admin-menu-panel")!;
    await pointer(panel, "pointerdown", 270);
    await pointer(panel, "pointermove", 35, 102);
    await pointer(panel, "pointerup", 35, 102);

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.style.overflow).toBe("");
  });
});
