import type { JobDeliverable } from "@/lib/job-deliverable-model";
import { calculateJobProgress, type JobProgress } from "@/lib/job-progress";

export type ClickUpJobProgress = JobProgress;

/** A brief item and the task generated from it represent one deliverable, not two. */
export function clickUpJobProgress(
  tasks: readonly { source_deliverable_id?: string | null; status: { key: string } | null }[],
  deliverables: readonly JobDeliverable[] = [],
  statusKey?: string,
): ClickUpJobProgress {
  return calculateJobProgress({ tasks: tasks.map(task => ({ source_deliverable_id: task.source_deliverable_id, status_key: task.status?.key })), deliverables, statusKey });
}

export function clickUpJobTitle(title: string, progress?: ClickUpJobProgress) {
  if (!progress) return title;
  return progress.total ? `[${progress.percent}% · ${progress.completed}/${progress.total} done] ${title}` : `[${progress.percent}% · status] ${title}`;
}

/** Strip only our validated decoration, and only when a caller knows this is a linked job. */
export function undecoratedClickUpJobTitle(title: string) {
  const weighted = /^\[(\d{1,3})% · (\d+)\/(\d+) done\] ([\s\S]+)$/.exec(title);
  if (weighted) {
    const [, percentage, done, count, original] = weighted;
    const percent = Number(percentage), completed = Number(done), total = Number(count);
    if (Number.isSafeInteger(completed) && Number.isSafeInteger(total) && total > 0 && completed <= total
      && percent <= 100 && percent >= Math.min(99, Math.round(completed / total * 100))
      && (completed === total ? percent === 100 : percent < 100)) return original;
    return title;
  }
  const standalone = /^\[(\d{1,3})% · status\] ([\s\S]+)$/.exec(title);
  if (standalone) return Number(standalone[1]) <= 100 ? standalone[2] : title;
  // Keep recognizing validated legacy prefixes during the rollout. Their
  // removal must not turn a percentage refresh into a CRM rename/conflict.
  const match = /^\[(\d+)\/(\d+) · (\d+)%\] ([\s\S]+)$/.exec(title);
  if (!match) return title;
  const [, done, count, percent, original] = match;
  const completed = Number(done), total = Number(count);
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || total < 1 || completed > total
    || Math.round(completed / total * 100) !== Number(percent)) return title;
  return original;
}
