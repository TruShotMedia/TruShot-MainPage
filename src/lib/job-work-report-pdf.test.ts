import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildJobWorkReport, type JobWorkSource, type TaskWorkSource } from "./job-work-report";
import { renderJobWorkReportPdf } from "./job-work-report-pdf";

function sample(includePricing: boolean) {
  const jobs: JobWorkSource[] = Array.from({ length: 3 }, (_, index) => ({
    id: `job-${index + 1}`,
    client_id: "sample-client",
    title: ["Brand story production", "Social content launch", "Campaign asset production"][index],
    job_number: `TS-${String(index + 1).padStart(3, "0")}`,
    shoot_date: `2026-09-${String(index * 3 + 1).padStart(2, "0")}`,
    due_date: `2026-09-${String(index * 3 + 8).padStart(2, "0")}`,
    photos_delivered: index === 0 ? 30 : 0,
    task_hours: 17.5,
    created_assets: 12,
  }));
  const tasks: TaskWorkSource[] = jobs.flatMap((job) => Array.from({ length: 12 }, (_, index) => ({
    id: `${job.id}-asset-${index + 1}`,
    job_id: job.id,
    title: index === 4 ? "A longer vertical interview cut for the launch sequence and supporting campaign edits" : `${index % 2 ? "Photo selection" : "Campaign video cut"} ${index + 1}`,
    asset_type: index % 2 ? "Photography" : "Video",
    status_id: index < 8 ? "done" : "draft",
    hours: index < 10 ? 1.5 : 1.25,
    due_date: null,
    position: (index + 1) * 1000,
  })));
  return buildJobWorkReport({
    selectedIds: jobs.map((job) => job.id),
    jobs,
    tasks,
    statusLabels: new Map([["done", "Posted / Done"], ["draft", "In Progress"]]),
    clientName: "Sample Client",
    allocations: jobs.map((job, index) => ({ job_id: job.id, invoice_id: `invoice-${index + 1}`, calculated_cents: 145000, needs_hours: false })),
    invoices: jobs.map((_, index) => ({ id: `invoice-${index + 1}`, status: "sent", archived_at: null })),
    includePricing,
    generatedAt: new Date("2026-09-16T00:00:00Z"),
  });
}

describe("renderJobWorkReportPdf", () => {
  it("builds a valid multi-page client report in both pricing modes", async () => {
    const priced = await renderJobWorkReportPdf(sample(true));
    const unpriced = await renderJobWorkReportPdf(sample(false));
    expect(priced.subarray(0, 5).toString()).toBe("%PDF-");
    expect(unpriced.subarray(0, 5).toString()).toBe("%PDF-");
    expect(priced.length).toBeGreaterThan(10_000);
    expect(unpriced.length).toBeGreaterThan(10_000);
    if (process.env.TRUSHOT_JOB_REPORT_PREVIEW_PATH) writeFileSync(process.env.TRUSHOT_JOB_REPORT_PREVIEW_PATH, priced);
    if (process.env.TRUSHOT_JOB_REPORT_UNPRICED_QA_PATH) writeFileSync(process.env.TRUSHOT_JOB_REPORT_UNPRICED_QA_PATH, unpriced);
  });
});
