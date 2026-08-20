import type { PortfolioItem } from "@/lib/types";

const imageTilePattern: PortfolioItem["display_size"][] = ["standard", "tall", "standard", "wide", "standard", "tall"];

function movePortfolioEntry<T extends { id: string }>(items: T[], activeId: string, overId: string): T[] {
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const overIndex = items.findIndex((item) => item.id === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return items;
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(activeIndex, 1);
  nextItems.splice(overIndex, 0, movedItem);
  return nextItems;
}

/** Moves one portfolio item without mutating the order received from the server. */
export function movePortfolioItem<T extends Pick<PortfolioItem, "id">>(items: T[], activeId: string, overId: string): T[] {
  return movePortfolioEntry(items, activeId, overId);
}

/** Moves a category without mutating the order received from the server. */
export function movePortfolioCategory<T extends { id: string }>(categories: T[], activeId: string, overId: string): T[] {
  return movePortfolioEntry(categories, activeId, overId);
}

/** Produces a varied editorial rhythm without requiring a layout choice per upload. */
export function getPortfolioDisplaySize(index: number, mediaKind: PortfolioItem["media_kind"]): PortfolioItem["display_size"] {
  if (mediaKind === "video") return "wide";
  return imageTilePattern[index % imageTilePattern.length];
}
