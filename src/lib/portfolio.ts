import type { PortfolioItem } from "@/lib/types";

/** Gives the collection a strong motion-led opener while preserving the curator's order. */
export function curatePortfolioItems<T extends Pick<PortfolioItem, "media_kind">>(items: T[]): T[] {
  const firstVideoIndex = items.findIndex((item) => item.media_kind === "video");
  if (firstVideoIndex <= 0) return [...items];
  return [items[firstVideoIndex], ...items.slice(0, firstVideoIndex), ...items.slice(firstVideoIndex + 1)];
}
