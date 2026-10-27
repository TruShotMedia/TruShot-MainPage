import { closestCenter, pointerWithin, type CollisionDetection, type KeyboardCoordinateGetter } from "@dnd-kit/core";

// A pointer selects the column beneath it, not whichever column overlaps most
// of a long card. No nearest-column fallback outside the board on pointer input.
export const pipelineColumnCollision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

export const pipelineColumnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
  const rect = context.collisionRect;
  if (!rect) return;
  const columns = context.droppableContainers.getEnabled()
    .map((column) => ({ id: column.id, rect: context.droppableRects.get(column.id) }))
    .filter((column) => column.rect !== undefined)
    .sort((left, right) => left.rect!.left - right.rect!.left);
  const index = columns.findIndex((column) => column.id === context.over?.id);
  if (index < 0) return;
  const next = columns[index + (event.code === "ArrowRight" ? 1 : -1)]?.rect;
  if (!next) return;
  event.preventDefault();
  return { x: currentCoordinates.x + next.left + next.width / 2 - rect.left - rect.width / 2, y: currentCoordinates.y };
};
