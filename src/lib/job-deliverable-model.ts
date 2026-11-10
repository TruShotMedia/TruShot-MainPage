export type JobDeliverable = { id: string; name: string; date: string | null };
export type JobLinkedTask = {
  id: string;
  title: string;
  due_date: string | null;
  source_deliverable_id?: string | null;
  is_complete?: boolean;
  status_label?: string;
};
export type JobDeliverableRow = JobDeliverable & {
  task_id?: string;
  is_complete?: boolean;
  status_label?: string;
};

export function getJobDeliverables(job: { deliverables?: JobDeliverable[]; key_deliverables?: string[] }) {
  if (job.deliverables?.length) return job.deliverables;
  // Compatibility for an older cached payload. IDs remain stable during SSR.
  return (job.key_deliverables ?? []).map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, date: null,
  }));
}

/** Display projection only. Never submit task-backed rows as new deliverables. */
export function getJobDeliverableRows(job: {
  deliverables?: JobDeliverable[];
  key_deliverables?: string[];
  linked_tasks?: JobLinkedTask[];
}): JobDeliverableRow[] {
  const tasks = job.linked_tasks ?? [];
  const byDeliverable = new Map(tasks.filter(task => task.source_deliverable_id).map(task => [task.source_deliverable_id, task]));
  const represented = new Set<string>();
  const rows = getJobDeliverables(job).map((item): JobDeliverableRow => {
    const task = byDeliverable.get(item.id);
    if (!task) return { ...item };
    represented.add(task.id);
    return { ...item, name: task.title, date: task.due_date, task_id: task.id, is_complete: task.is_complete, status_label: task.status_label };
  });
  for (const task of tasks) {
    if (represented.has(task.id)) continue;
    represented.add(task.id);
    rows.push({ id: `task:${task.id}`, name: task.title, date: task.due_date, task_id: task.id, is_complete: task.is_complete, status_label: task.status_label });
  }
  return rows;
}
