export const TASK_POSITION_STEP = 1_000;
export const TASK_POSITION_MAX = 999_999_999_999;

export function nextTaskPosition(highestPosition: number | string | null | undefined) {
  const highest = Number(highestPosition ?? 0);
  if (!Number.isFinite(highest) || highest < 0) throw new Error("The current task position is invalid.");

  const next = highest + TASK_POSITION_STEP;
  if (next > TASK_POSITION_MAX) throw new Error("Task positions need to be normalised before another task can be moved.");
  return next;
}
