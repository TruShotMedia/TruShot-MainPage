// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioCategory } from "@/lib/types";
import { PortfolioManager } from "./portfolio-manager";

const actionMocks = vi.hoisted(() => ({
  createPortfolioCategory: vi.fn(async () => ({ id: "33333333-3333-4333-8333-333333333333" })),
  createPortfolioItems: vi.fn(async () => ({ ok: true })),
  deletePortfolioCategory: vi.fn(async () => ({ ok: true })),
  deletePortfolioItem: vi.fn(async () => ({ ok: true })),
  reorderPortfolioCategories: vi.fn(async () => ({ ok: true, updated: 1 })),
  reorderPortfolioItems: vi.fn(async () => ({ ok: true, updated: 1 })),
}));

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("@/app/admin/actions", () => actionMocks);
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("next/image", () => ({ default: () => null }));

const categories: PortfolioCategory[] = [{
  id: "11111111-1111-4111-8111-111111111111",
  name: "Campaigns",
  slug: "campaigns",
  description: null,
  position: 10,
  is_published: true,
  items: [{
    id: "22222222-2222-4222-8222-222222222222",
    category_id: "11111111-1111-4111-8111-111111111111",
    media_kind: "image",
    alt_text: "Campaign portfolio image",
    public_url: "https://example.com/campaign.jpg",
    display_size: "wide",
  }],
}];

const sortableCategories: PortfolioCategory[] = [
  categories[0],
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Brand stories",
    slug: "brand-stories",
    description: "Long-form brand work",
    position: 20,
    is_published: true,
    items: [],
  },
];

describe("PortfolioManager media removal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    actionMocks.deletePortfolioItem.mockClear();
    routerMocks.refresh.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderManager() {
    await act(async () => {
      root.render(<PortfolioManager categories={categories} workspaceId="11111111-1111-4111-8111-111111111111" />);
    });
  }

  it("requires an explicit, cancellable confirmation before deleting media", async () => {
    await renderManager();
    const removeButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Remove media"))!;

    await act(async () => removeButton.click());

    expect(actionMocks.deletePortfolioItem).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Delete permanently?");

    const keepButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Keep")!;
    await act(async () => keepButton.click());

    expect(container.textContent).not.toContain("Delete permanently?");
    expect(actionMocks.deletePortfolioItem).not.toHaveBeenCalled();
  });

  it("calls the server action and refreshes after confirmation", async () => {
    await renderManager();
    const removeButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Remove media"))!;
    await act(async () => removeButton.click());
    const deleteButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete")!;

    await act(async () => {
      deleteButton.click();
      await Promise.resolve();
    });

    expect(actionMocks.deletePortfolioItem).toHaveBeenCalledWith(categories[0].items[0].id);
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Photo removed from the portfolio.");
  });

  it("renders independent category and media drag handles", async () => {
    await act(async () => {
      root.render(<PortfolioManager categories={sortableCategories} workspaceId="11111111-1111-4111-8111-111111111111" />);
    });

    const categoryHandles = Array.from(container.querySelectorAll<HTMLButtonElement>(".portfolio-category-order-handle"));
    const mediaHandles = Array.from(container.querySelectorAll<HTMLButtonElement>(".portfolio-order-handle"));

    expect(categoryHandles).toHaveLength(2);
    expect(categoryHandles.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Move Campaigns category",
      "Move Brand stories category",
    ]);
    expect(categoryHandles.every((button) => !button.disabled)).toBe(true);
    expect(mediaHandles).toHaveLength(1);
    expect(container.textContent).toContain("Drag a category handle to set the order shown on your portfolio.");
  });
});
