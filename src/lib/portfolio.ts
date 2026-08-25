import type { PortfolioCategory, PortfolioItem } from "@/lib/types";

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

/** Moves media into another category and updates its ownership without mutating server state. */
export function movePortfolioItemBetweenCategories(
  categories: PortfolioCategory[],
  activeId: string,
  targetCategoryId: string,
  overItemId: string | null = null,
): PortfolioCategory[] {
  const sourceCategory = categories.find((category) => category.items.some((item) => item.id === activeId));
  const targetCategory = categories.find((category) => category.id === targetCategoryId);
  if (!sourceCategory || !targetCategory || sourceCategory.id === targetCategory.id) return categories;

  const movedItem = sourceCategory.items.find((item) => item.id === activeId);
  if (!movedItem) return categories;

  const targetIndex = overItemId === null
    ? targetCategory.items.length
    : targetCategory.items.findIndex((item) => item.id === overItemId);
  if (targetIndex < 0) return categories;

  const nextTargetItems = [...targetCategory.items];
  nextTargetItems.splice(targetIndex, 0, { ...movedItem, category_id: targetCategoryId });

  return categories.map((category) => {
    if (category.id === sourceCategory.id) {
      return { ...category, items: category.items.filter((item) => item.id !== activeId) };
    }
    if (category.id === targetCategoryId) {
      return { ...category, items: nextTargetItems };
    }
    return category;
  });
}

/** Matches the portfolio tile to the media's real orientation. */
export function getPortfolioDisplaySizeFromDimensions(width: number, height: number): PortfolioItem["display_size"] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "standard";
  const ratio = width / height;
  if (ratio >= 1.15) return "wide";
  if (ratio <= 0.9) return "tall";
  return "standard";
}
