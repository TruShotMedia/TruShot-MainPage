import { describe, expect, it } from "vitest";
import { buildJobWorkReport, type JobWorkSource, type TaskWorkSource } from "./job-work-report";

const jobs: JobWorkSource[] = [
  { id: "job-a", client_id: "client-a", title: "Brand shoot", job_number: "JOB-1", shoot_date: "2026-09-01", due_date: "2026-09-08", photos_delivered: 20, task_hours: 3.5, created_assets: 2 },
  { id: "job-b", client_id: "client-a", title: "Social cut", job_number: null, shoot_date: "2026-09-10", due_date: null, photos_delivered: 0, task_hours: 1, created_assets: 1 },
];
const tasks: TaskWorkSource[] = [
  { id: "asset-2", job_id: "job-a", title: "Photo set", asset_type: "Photography", status_id: "done", hours: 1.5, due_date: null, position: 2000 },
  { id: "asset-1", job_id: "job-a", title: "Hero reel", asset_type: "Video", status_id: "done", hours: 2, due_date: null, position: 1000 },
  { id: "asset-3", job_id: "job-b", title: "Vertical cut", asset_type: "Video", status_id: "draft", hours: 1, due_date: null, position: 1000 },
];
const base = {
  selectedIds: ["job-b", "job-a"],
  jobs,
  tasks,
  statusLabels: new Map([["done", "Posted / Done"], ["draft", "In Progress"]]),
  clientName: "Sample Client",
  allocations: [
    { job_id: "job-a", invoice_id: "invoice-a", calculated_cents: 38000, needs_hours: false },
    { job_id: "job-b", invoice_id: "invoice-b", calculated_cents: 12000, needs_hours: false },
  ],
  invoices: [
    { id: "invoice-a", status: "sent", archived_at: null },
    { id: "invoice-b", status: "void", archived_at: null },
  ],
  generatedAt: new Date("2026-09-16T00:00:00Z"),
};

describe("buildJobWorkReport", () => {
  it("sorts the jobs and task rows, and sums only recorded task hours", () => {
    const report = buildJobWorkReport({ ...base, includePricing: false });
    expect(report.jobs.map((job) => job.title)).toEqual(["Brand shoot", "Social cut"]);
    expect(report.jobs[0].tasks.map((task) => task.title)).toEqual(["Hero reel", "Photo set"]);
    expect(report.totals).toMatchObject({ assetCount: 3, recordedHours: 4.5, photosDelivered: 20, valueCents: 0 });
    expect(report.jobs.every((job) => job.valueCents === null)).toBe(true);
  });

  it("uses only active invoice allocations and marks the priced total as partial", () => {
    const report = buildJobWorkReport({ ...base, includePricing: true });
    expect(report.jobs[0].valueCents).toBe(38000);
    expect(report.jobs[1].valueCents).toBeNull();
    expect(report.totals.valueCents).toBe(38000);
    expect(report.totals.hasUnpricedJobs).toBe(true);
  });

  it("flags missing task hours rather than claiming the total is complete", () => {
    const report = buildJobWorkReport({
      ...base,
      jobs: [{ ...jobs[0], task_hours: 2 }, jobs[1]],
      tasks: [{ ...tasks[0], hours: null }, ...tasks.slice(1)],
      includePricing: false,
    });
    expect(report.jobs[0].recordedHours).toBe(2);
    expect(report.jobs[0].unloggedHoursCount).toBe(1);
    expect(report.totals.unloggedHoursCount).toBe(1);
  });

  it("refuses mixed-client selections and incomplete job/task data", () => {
    expect(() => buildJobWorkReport({ ...base, jobs: [jobs[0], { ...jobs[1], client_id: "client-b" }], includePricing: false })).toThrow(/one client/);
    expect(() => buildJobWorkReport({ ...base, jobs: [jobs[0]], includePricing: false })).toThrow(/no longer available/);
    expect(() => buildJobWorkReport({ ...base, tasks: tasks.slice(1), includePricing: false })).toThrow(/Task data was incomplete/);
  });
});
