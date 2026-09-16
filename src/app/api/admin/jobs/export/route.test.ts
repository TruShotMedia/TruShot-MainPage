import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  renderPdf: vi.fn(async (report: unknown) => { void report; return Buffer.from("%PDF-1.7\nexample"); }),
}));

vi.mock("@/lib/data/admin", () => ({ getAdminContext: mocks.getAdminContext }));
vi.mock("@/lib/job-work-report-pdf", () => ({ renderJobWorkReportPdf: mocks.renderPdf }));

const jobId = "33333333-3333-4333-8333-333333333333";
const clientId = "55555555-5555-4555-8555-555555555555";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const job = {
  id: jobId, client_id: clientId, title: "Campaign shoot", job_number: "JOB-1",
  shoot_date: "2026-09-01", due_date: "2026-09-08", photos_delivered: 12,
  task_hours: 2, created_assets: 1,
};
const results: Record<string, { data: unknown; error: null }> = {
  "website-job-metrics": { data: [job], error: null },
  "website-jobs": { data: [{ id: jobId }], error: null },
  "website-job-tasks": { data: [{
    id: "77777777-7777-4777-8777-777777777777", job_id: jobId, title: "Hero reel",
    asset_type: "Video", status_id: "66666666-6666-4666-8666-666666666666", hours: 2,
    due_date: "2026-09-08", position: 1000,
  }], error: null },
  "website-task-statuses": { data: [{ id: "66666666-6666-4666-8666-666666666666", label: "Posted / Done" }], error: null },
  "website-clients": { data: { id: clientId, name: "Sample Client" }, error: null },
  "website-invoice-allocation-metrics": { data: [{ job_id: jobId, invoice_id: invoiceId, calculated_cents: 45000, needs_hours: false }], error: null },
  "website-invoices": { data: [{ id: invoiceId, status: "sent", archived_at: null }], error: null },
};

function request(jobIds: string[], includePricing: boolean, origin = "https://www.trushotmedia.com") {
  return new Request("https://www.trushotmedia.com/api/admin/jobs/export", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ jobIds, includePricing }),
  });
}

describe("POST /api/admin/jobs/export", () => {
  const from = vi.fn((table: string) => {
    const result = results[table];
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      in: () => query,
      order: () => query,
      range: () => query,
      maybeSingle: async () => result,
      then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve),
    };
    return query;
  });

  beforeEach(() => {
    from.mockClear();
    mocks.renderPdf.mockClear();
    mocks.getAdminContext.mockReset();
    mocks.getAdminContext.mockResolvedValue({
      membership: { workspace_id: TRUSHOT_WORKSPACE_ID },
      supabase: { from },
    });
    results["website-job-metrics"].data = [job];
  });

  it("rejects requests without an admin session or from another origin", async () => {
    mocks.getAdminContext.mockResolvedValueOnce(null);
    expect((await POST(request([jobId], false))).status).toBe(401);
    expect((await POST(request([jobId], false, "https://other.example"))).status).toBe(403);
    expect(mocks.renderPdf).not.toHaveBeenCalled();
  });

  it("returns a private PDF with selected jobs, task hours and no pricing queries in negotiation mode", async () => {
    const response = await POST(request([jobId], false));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("sample-client");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toContain("%PDF-1.7");
    expect(from).not.toHaveBeenCalledWith("website-invoice-allocation-metrics");
    expect(mocks.renderPdf.mock.calls[0][0]).toMatchObject({
      clientName: "Sample Client", includePricing: false,
      totals: { assetCount: 1, recordedHours: 2 },
    });
  });

  it("includes only active invoice allocations when pricing is requested", async () => {
    const response = await POST(request([jobId], true));
    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("website-invoice-allocation-metrics");
    expect(mocks.renderPdf.mock.calls[0][0]).toMatchObject({
      includePricing: true, totals: { valueCents: 45000, hasPricedJobs: true },
    });
  });

  it("refuses a mixed-client selection before generating a report", async () => {
    const secondJobId = "88888888-8888-4888-8888-888888888888";
    results["website-job-metrics"].data = [job, { ...job, id: secondJobId, client_id: "99999999-9999-4999-8999-999999999999" }];
    results["website-jobs"].data = [{ id: jobId }, { id: secondJobId }];
    const response = await POST(request([jobId, secondJobId], false));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("one client");
    expect(mocks.renderPdf).not.toHaveBeenCalled();
    results["website-jobs"].data = [{ id: jobId }];
  });
});
