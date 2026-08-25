import { describe, expect, it } from "vitest";
import { getPortfolioDisplaySizeFromDimensions, movePortfolioCategory, movePortfolioItem, movePortfolioItemBetweenCategories } from "./portfolio";

describe("movePortfolioItem", () => {
  it("moves an item to the requested place without mutating the saved order", () => {
    const items = [
      { id: "photo-a" },
      { id: "photo-b" },
      { id: "video-a" },
    ];

    expect(movePortfolioItem(items, "video-a", "photo-a").map((item) => item.id)).toEqual([
      "video-a",
      "photo-a",
      "photo-b",
    ]);
    expect(items[0].id).toBe("photo-a");
  });

  it("returns the current order when a drag target is missing", () => {
    const items = [{ id: "photo-a" }, { id: "photo-b" }];
    expect(movePortfolioItem(items, "missing", "photo-b")).toBe(items);
  });
});

describe("movePortfolioCategory", () => {
  it("moves a category while leaving the server-provided order untouched", () => {
    const categories = [
      { id: "campaigns", name: "Campaigns" },
      { id: "brand-stories", name: "Brand stories" },
      { id: "social-content", name: "Social content" },
    ];

    expect(movePortfolioCategory(categories, "social-content", "campaigns").map((category) => category.id)).toEqual([
      "social-content",
      "campaigns",
      "brand-stories",
    ]);
    expect(categories.map((category) => category.id)).toEqual(["campaigns", "brand-stories", "social-content"]);
  });
});

describe("movePortfolioItemBetweenCategories", () => {
  const categories = [
    {
      id: "campaigns",
      name: "Campaigns",
      slug: "campaigns",
      description: null,
      logo_url: null,
      logo_path: null,
      position: 10,
      is_published: true,
      items: [
        { id: "video-a", category_id: "campaigns", media_kind: "video" as const, alt_text: "Video", public_url: "/video.mp4", poster_url: null, poster_path: null, display_size: "wide" as const },
        { id: "photo-a", category_id: "campaigns", media_kind: "image" as const, alt_text: "Photo", public_url: "/photo.jpg", poster_url: null, poster_path: null, display_size: "standard" as const },
      ],
    },
    {
      id: "brand-stories",
      name: "Brand stories",
      slug: "brand-stories",
      description: null,
      logo_url: null,
      logo_path: null,
      position: 20,
      is_published: true,
      items: [
        { id: "photo-b", category_id: "brand-stories", media_kind: "image" as const, alt_text: "Photo B", public_url: "/photo-b.jpg", poster_url: null, poster_path: null, display_size: "tall" as const },
      ],
    },
  ];

  it("moves a video before the selected item and changes its category", () => {
    const moved = movePortfolioItemBetweenCategories(categories, "video-a", "brand-stories", "photo-b");

    expect(moved[0].items.map((item) => item.id)).toEqual(["photo-a"]);
    expect(moved[1].items.map((item) => item.id)).toEqual(["video-a", "photo-b"]);
    expect(moved[1].items[0].category_id).toBe("brand-stories");
    expect(categories[0].items.map((item) => item.id)).toEqual(["video-a", "photo-a"]);
  });

  it("appends media when the category itself is the drop target", () => {
    const moved = movePortfolioItemBetweenCategories(categories, "video-a", "brand-stories");
    expect(moved[1].items.map((item) => item.id)).toEqual(["photo-b", "video-a"]);
  });

  it("keeps the current state when the target is invalid", () => {
    expect(movePortfolioItemBetweenCategories(categories, "video-a", "missing")).toBe(categories);
  });
});

describe("getPortfolioDisplaySizeFromDimensions", () => {
  it("matches horizontal, vertical, and square media to its natural tile", () => {
    expect(getPortfolioDisplaySizeFromDimensions(1920, 1080)).toBe("wide");
    expect(getPortfolioDisplaySizeFromDimensions(1080, 1920)).toBe("tall");
    expect(getPortfolioDisplaySizeFromDimensions(1200, 1200)).toBe("standard");
    expect(getPortfolioDisplaySizeFromDimensions(1080, 1350)).toBe("tall");
  });

  it("uses a stable square tile when dimensions are unavailable", () => {
    expect(getPortfolioDisplaySizeFromDimensions(0, 0)).toBe("standard");
  });
});
