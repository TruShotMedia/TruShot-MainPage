import type { JobDeliverable } from "@/lib/job-deliverable-model";

export type ClickUpJobProgress = { completed: number; total: number; percent: number };

/** A brief item and the task generated from it represent one deliverable, not two. */
export function clickUpJobProgress(
  tasks: readonly { source_deliverable_id?: string | null; status: { key: string } | null }[],
  deliverables: readonly JobDeliverable[] = [],
): ClickUpJobProgress {
  const represented = new Set(tasks.map(task => task.source_deliverable_id).filter(Boolean));
  const uncreated = new Set(deliverables.filter(item => !represented.has(item.id)).map(item => item.id));
  const total = tasks.length + uncreated.size;
  const completed = tasks.filter(task => task.status?.key === "posted_done").length;
  return { completed, total, percent: total ? Math.round(completed / total * 100) : 0 };
}

export function clickUpJobTitle(title: string, progress?: ClickUpJobProgress) {
  return progress?.total ? `[${progress.completed}/${progress.total} · ${progress.percent}%] ${title}` : title;
}

/** Strip only our validated decoration, and only when a caller knows this is a linked job. */
export function undecoratedClickUpJobTitle(title: string) {
  const match = /^\[(\d+)\/(\d+) · (\d+)%\] ([\s\S]+)$/.exec(title);
  if (!match) return title;
  const [, done, count, percent, original] = match;
  const completed = Number(done), total = Number(count);
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || total < 1 || completed > total
    || Math.round(completed / total * 100) !== Number(percent)) return title;
  return original;
}
