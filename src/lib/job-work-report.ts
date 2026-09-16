export type JobWorkSource = {
  id: string;
  client_id: string | null;
  title: string;
  job_number: string | null;
  shoot_date: string | null;
  due_date: string | null;
  photos_delivered: number;
  task_hours: number;
  created_assets: number;
};

export type TaskWorkSource = {
  id: string;
  job_id: string;
  title: string;
  asset_type: string | null;
  status_id: string;
  hours: number | null;
  due_date: string | null;
  position: number;
};

export type JobAllocationSource = {
  job_id: string;
  invoice_id: string;
  calculated_cents: number;
  needs_hours: boolean;
};

export type InvoiceSource = {
  id: string;
  status: string;
  archived_at: string | null;
};

export type JobWorkReport = {
  clientName: string;
  generatedAt: Date;
  includePricing: boolean;
  jobs: Array<{
    id: string;
    title: string;
    jobNumber: string | null;
    shootDate: string | null;
    dueDate: string | null;
    assetCount: number;
    recordedHours: number;
    unloggedHoursCount: number;
    photosDelivered: number;
    valueCents: number | null;
    pricingIsPartial: boolean;
    tasks: Array<{
      id: string;
      title: string;
      assetType: string | null;
      statusLabel: string;
      hours: number | null;
      dueDate: string | null;
    }>;
  }>;
  totals: {
    assetCount: number;
    recordedHours: number;
    unloggedHoursCount: number;
    photosDelivered: number;
    valueCents: number;
    hasUnpricedJobs: boolean;
    hasPricedJobs: boolean;
  };
};

function roundedHours(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildJobWorkReport(input: {
  selectedIds: string[];
  jobs: JobWorkSource[];
  tasks: TaskWorkSource[];
  statusLabels: ReadonlyMap<string, string>;
  clientName: string | null;
  allocations: JobAllocationSource[];
  invoices: InvoiceSource[];
  includePricing: boolean;
  generatedAt?: Date;
}): JobWorkReport {
  const ids = [...new Set(input.selectedIds)];
  if (!ids.length || input.jobs.length !== ids.length || input.jobs.some((job) => !ids.includes(job.id))) {
    throw new Error("One or more selected jobs are no longer available. Refresh and try again.");
  }
  const clientIds = new Set(input.jobs.map((job) => job.client_id ?? ""));
  if (clientIds.size !== 1) throw new Error("Select jobs for one client at a time to keep each report client-safe.");

  const tasksByJob = new Map(ids.map((id) => [id, [] as TaskWorkSource[]]));
  for (const task of input.tasks) tasksByJob.get(task.job_id)?.push(task);
  const validInvoiceIds = new Set(input.invoices.filter((invoice) => !invoice.archived_at && invoice.status !== "void").map((invoice) => invoice.id));
  const allocationsByJob = new Map(ids.map((id) => [id, [] as JobAllocationSource[]]));
  if (input.includePricing) {
    for (const allocation of input.allocations) {
      if (validInvoiceIds.has(allocation.invoice_id)) allocationsByJob.get(allocation.job_id)?.push(allocation);
    }
  }

  const jobs = input.jobs.map((job) => {
    const taskSources = (tasksByJob.get(job.id) ?? []).sort((left, right) =>
      Number(left.position) - Number(right.position) || left.title.localeCompare(right.title));
    if (taskSources.length !== Number(job.created_assets)) {
      throw new Error("Task data was incomplete, so the report was not generated. Refresh and retry.");
    }
    const recordedHours = roundedHours(taskSources.reduce((total, task) => total + (task.hours == null ? 0 : Number(task.hours)), 0));
    if (!Number.isFinite(recordedHours) || Math.abs(recordedHours - Number(job.task_hours)) > 0.01) {
      throw new Error("Recorded task hours could not be reconciled. Refresh and retry.");
    }
    const unloggedHoursCount = taskSources.filter((task) => task.hours == null).length;
    const allocations = allocationsByJob.get(job.id) ?? [];
    const validAllocations = allocations.filter((allocation) => !allocation.needs_hours);
    const pricingIsPartial = allocations.length === 0 || allocations.some((allocation) => allocation.needs_hours);
    const valueCents = input.includePricing && validAllocations.length
      ? validAllocations.reduce((total, allocation) => total + Number(allocation.calculated_cents), 0)
      : null;
    return {
      id: job.id,
      title: job.title,
      jobNumber: job.job_number,
      shootDate: job.shoot_date,
      dueDate: job.due_date,
      assetCount: taskSources.length,
      recordedHours,
      unloggedHoursCount,
      photosDelivered: Number(job.photos_delivered),
      valueCents,
      pricingIsPartial,
      tasks: taskSources.map((task) => ({
        id: task.id,
        title: task.title,
        assetType: task.asset_type,
        statusLabel: input.statusLabels.get(task.status_id) ?? "Status unavailable",
        hours: task.hours == null ? null : Number(task.hours),
        dueDate: task.due_date,
      })),
    };
  }).sort((left, right) =>
    (left.shootDate ?? left.dueDate ?? "9999-12-31").localeCompare(right.shootDate ?? right.dueDate ?? "9999-12-31") || left.title.localeCompare(right.title));

  return {
    clientName: input.clientName || "Unassigned work",
    generatedAt: input.generatedAt ?? new Date(),
    includePricing: input.includePricing,
    jobs,
    totals: {
      assetCount: jobs.reduce((total, job) => total + job.assetCount, 0),
      recordedHours: roundedHours(jobs.reduce((total, job) => total + job.recordedHours, 0)),
      unloggedHoursCount: jobs.reduce((total, job) => total + job.unloggedHoursCount, 0),
      photosDelivered: jobs.reduce((total, job) => total + job.photosDelivered, 0),
      valueCents: jobs.reduce((total, job) => total + (job.valueCents ?? 0), 0),
      hasUnpricedJobs: input.includePricing && jobs.some((job) => job.pricingIsPartial),
      hasPricedJobs: input.includePricing && jobs.some((job) => job.valueCents !== null),
    },
  };
}
