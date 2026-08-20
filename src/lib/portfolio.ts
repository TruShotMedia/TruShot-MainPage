import type { PortfolioItem } from "@/lib/types";

const imageTilePattern: PortfolioItem["display_size"][] = ["standard", "tall", "standard", "wide", "standard", "tall"];

/** Gives the collection a strong motion-led opener while preserving the curator's order. */
export function curatePortfolioItems<T extends Pick<PortfolioItem, "media_kind">>(items: T[]): T[] {
  const firstVideoIndex = items.findIndex((item) => item.media_kind === "video");
  if (firstVideoIndex <= 0) return [...items];
  return [items[firstVideoIndex], ...items.slice(0, firstVideoIndex), ...items.slice(firstVideoIndex + 1)];
}

/** Produces a varied editorial rhythm without requiring a layout choice per upload. */
export function getPortfolioDisplaySize(index: number, mediaKind: PortfolioItem["media_kind"]): PortfolioItem["display_size"] {
  if (mediaKind === "video") return "wide";
  return imageTilePattern[index % imageTilePattern.length];
}
