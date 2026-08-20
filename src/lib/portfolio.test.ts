import { describe, expect, it } from "vitest";
import { getPortfolioDisplaySize, movePortfolioCategory, movePortfolioItem } from "./portfolio";

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

describe("getPortfolioDisplaySize", () => {
  it("makes videos wide so motion has room to lead", () => {
    expect(getPortfolioDisplaySize(0, "video")).toBe("wide");
    expect(getPortfolioDisplaySize(4, "video")).toBe("wide");
  });

  it("cycles images through a balanced editorial pattern", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((index) => getPortfolioDisplaySize(index, "image"))).toEqual([
      "standard",
      "tall",
      "standard",
      "wide",
      "standard",
      "tall",
      "standard",
    ]);
  });
});
