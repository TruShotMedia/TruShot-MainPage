import { z } from "zod";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";
import { buildJobWorkReport } from "@/lib/job-work-report";
import { renderJobWorkReportPdf } from "@/lib/job-work-report-pdf";

export const runtime = "nodejs";

const requestSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1).max(100),
  includePricing: z.boolean(),
});

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request: Request) {
  const context = await getAdminContext();
  if (!context || context.membership.workspace_id !== TRUSHOT_WORKSPACE_ID) {
    return jsonError("Unauthorised", 401);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonError("This export must be requested from the admin app.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Choose at least one job to export.", 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonError("Choose between 1 and 100 valid jobs to export.", 400);
  const jobIds = [...new Set(parsed.data.jobIds)];
  const supabase = context.supabase;

  try {
    const [metricsResult, activeJobsResult] = await Promise.all([
      supabase.from("website-job-metrics")
        .select("id,client_id,title,job_number,shoot_date,due_date,photos_delivered,task_hours,created_assets")
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("id", jobIds),
      supabase.from("website-jobs").select("id")
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).in("id", jobIds),
    ]);
    if (metricsResult.error || activeJobsResult.error) throw new Error("Selected jobs could not be loaded.");
    const activeIds = new Set((activeJobsResult.data ?? []).map((job) => job.id));
    const jobs = (metricsResult.data ?? []).filter((job) => activeIds.has(job.id));
    if (jobs.length !== jobIds.length) {
      return jsonError("One or more selected jobs are no longer available. Refresh and try again.", 422);
    }
    const clientIds = new Set(jobs.map((job) => job.client_id ?? ""));
    if (clientIds.size > 1) {
      return jsonError("Select jobs for one client at a time to keep each report client-safe.", 422);
    }

    const tasks: Array<{
      id: string; job_id: string; title: string; asset_type: string | null;
      status_id: string; hours: number | null; due_date: string | null; position: number;
    }> = [];
    for (let offset = 0; offset <= 5000; offset += 1000) {
      const result = await supabase.from("website-job-tasks")
        .select("id,job_id,title,asset_type,status_id,hours,due_date,position")
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null)
        .in("job_id", jobIds).order("id").range(offset, offset + 999);
      if (result.error) throw new Error("Selected asset data could not be loaded.");
      tasks.push(...(result.data ?? []).map((task) => ({
        ...task,
        position: Number(task.position ?? 0),
        hours: task.hours == null ? null : Number(task.hours),
      })));
      if ((result.data ?? []).length < 1000) break;
      if (offset === 5000) return jsonError("This selection has too many assets for one report. Export fewer jobs at a time.", 422);
    }

    const statusIds = [...new Set(tasks.map((task) => task.status_id))];
    const clientId = jobs[0]?.client_id;
    const [statusesResult, clientResult, allocationsResult] = await Promise.all([
      statusIds.length
        ? supabase.from("website-task-statuses").select("id,label")
          .eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("id", statusIds)
        : Promise.resolve({ data: [], error: null }),
      clientId
        ? supabase.from("website-clients").select("id,name")
          .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("id", clientId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      parsed.data.includePricing
        ? supabase.from("website-invoice-allocation-metrics")
          .select("job_id,invoice_id,calculated_cents,needs_hours")
          .eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("job_id", jobIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (statusesResult.error || clientResult.error || allocationsResult.error) {
      throw new Error("Report details could not be loaded.");
    }
    if (clientId && !clientResult.data) throw new Error("Client details could not be loaded.");
    const invoiceIds = [...new Set((allocationsResult.data ?? []).map((allocation) => allocation.invoice_id))];
    const invoicesResult = invoiceIds.length
      ? await supabase.from("website-invoices").select("id,status,archived_at")
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID).in("id", invoiceIds)
      : { data: [], error: null };
    if (invoicesResult.error) throw new Error("Related invoice data could not be loaded.");

    const report = buildJobWorkReport({
      selectedIds: jobIds,
      jobs: jobs.map((job) => ({
        ...job,
        photos_delivered: Number(job.photos_delivered ?? 0),
        task_hours: Number(job.task_hours ?? 0),
        created_assets: Number(job.created_assets ?? 0),
      })),
      tasks,
      statusLabels: new Map((statusesResult.data ?? []).map((status) => [status.id, status.label])),
      clientName: clientResult.data?.name ?? null,
      allocations: (allocationsResult.data ?? []).map((allocation) => ({
        ...allocation,
        calculated_cents: Number(allocation.calculated_cents ?? 0),
      })),
      invoices: invoicesResult.data ?? [],
      includePricing: parsed.data.includePricing,
    });
    const pdf = await renderJobWorkReportPdf(report);
    const safeClientName = report.clientName.toLowerCase().normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "client";
    const date = report.generatedAt.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="trushot-work-report-${safeClientName}-${date}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && /Refresh and|reconciled|incomplete|one client/.test(error.message)) {
      return jsonError(error.message, 422);
    }
    console.error("Job work report export failed", error);
    return jsonError("The PDF could not be generated. Please try again or export fewer jobs.", 500);
  }
}
