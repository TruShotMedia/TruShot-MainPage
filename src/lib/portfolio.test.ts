import { describe, expect, it } from "vitest";
import { curatePortfolioItems } from "./portfolio";

describe("curatePortfolioItems", () => {
  it("moves the first video into the feature position without losing the remaining order", () => {
    const items = [
      { id: "photo-a", media_kind: "image" as const },
      { id: "photo-b", media_kind: "image" as const },
      { id: "video-a", media_kind: "video" as const },
      { id: "video-b", media_kind: "video" as const },
    ];

    expect(curatePortfolioItems(items).map((item) => item.id)).toEqual([
      "video-a",
      "photo-a",
      "photo-b",
      "video-b",
    ]);
    expect(items[0].id).toBe("photo-a");
  });

  it("keeps a photo-only collection in its curated order", () => {
    const items = [
      { id: "photo-a", media_kind: "image" as const },
      { id: "photo-b", media_kind: "image" as const },
    ];

    expect(curatePortfolioItems(items)).toEqual(items);
  });
});
