"use client";

import { useJobSupportingData } from "@/components/autopacific/job-supporting-data";
import type { JobDeliverable } from "@/lib/job-deliverable-model";

// Keep the export/props compatible with existing editors. The atomic job save
// now creates tasks; a second client mutation is no longer necessary.
export function CreateDeliverableTasksButton({ jobId, deliverables, requireSaved = false }: { jobId: string; deliverables?: JobDeliverable[]; onCreated?: () => void; requireSaved?: boolean }) {
  const support = useJobSupportingData(jobId);
  const linked = new Set(support.data?.linkedTasks.map(task => task.source_deliverable_id) ?? []);
  const allLinked = Boolean(deliverables?.length && deliverables.every(item => linked.has(item.id)));
  return <div className="job-deliverables-generate">
    <p className={allLinked ? "deliverables-linked" : undefined} role="status">{allLinked ? `${deliverables!.length} deliverables · tasks linked` : "Deliverables become tasks automatically when you save."}</p>
    <small>{requireSaved ? "Save your changes to create new tasks and update linked task names. " : "Renaming a deliverable updates its linked task. "}Deliverable dates take priority, otherwise the job deadline is used. Progress, hours and notes are kept.</small>
    {support.error ? <p role="alert">{support.error}<button type="button" onClick={() => void support.reload()}>Retry linked tasks</button></p> : null}
  </div>;
}
