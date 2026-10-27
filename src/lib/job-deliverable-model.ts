export type JobDeliverable = { id: string; name: string; date: string | null };

export function getJobDeliverables(job: { deliverables?: JobDeliverable[]; key_deliverables?: string[] }) {
  if (job.deliverables?.length) return job.deliverables;
  // Compatibility for an older cached payload. IDs remain stable during SSR.
  return (job.key_deliverables ?? []).map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, date: null,
  }));
}
