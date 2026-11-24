import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductionContext } from "@/lib/data/admin";
import { shareIdPattern, buildSharedJobProgress } from "@/lib/job-progress-share";
import { createServiceClient } from "@/lib/supabase/service";
import type { JobDeliverable } from "@/lib/job-deliverable-model";

export const progressResponseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

export function progressJson(body: unknown, status = 200, extra?: Record<string, string>) {
  return Response.json(body, { status, headers: { ...progressResponseHeaders, ...extra } });
}

export function sameProgressOrigin(request: Request) {
  // Browser Fetch Metadata is set by the browser, not caller JavaScript. It
  // also survives the internal URL rewrite a reverse proxy or Next dev can do.
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  return request.headers.get("origin") === new URL(request.url).origin;
}

/** Tiny body limit enforced on the stream, including requests without content-length. */
export async function readProgressBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(256);
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (part.value.length > bytes.length - length) {
        await reader.cancel();
        return null;
      }
      bytes.set(part.value, length);
      length += part.value.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
  } catch {
    return null;
  }
}

export async function checkJobShareAccess(jobId: string) {
  if (!shareIdPattern.test(jobId)) return { status: 404 } as const;
  const context = await getProductionContext();
  if (!context) return { status: 401 } as const;
  if (context.access !== "admin" && (!context.team || context.team.role === "marketing")) return { status: 403 } as const;
  const { data, error } = await context.supabase.from("website-jobs").select("id")
    .eq("id", jobId).eq("workspace_id", context.membership.workspace_id).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!data) return { status: 404 } as const;
  return { status: 200, supabase: context.supabase } as const;
}

type JobRow = { title: string; workspace_id: string; deliverables: JobDeliverable[]; status: { key: string; label: string } | null };
type TaskRow = { title: string; source_deliverable_id: string | null; status: { key: string } | null };
// Fetch each page deterministically, so larger jobs aren't silently truncated
// by the Data API's per-response limit.
const taskPageSize = 500;
export async function readJobProgressSnapshot(supabase: SupabaseClient, jobId: string) {
  const { data: job, error: jobError } = await supabase.from("website-jobs")
    .select("title,workspace_id,deliverables,status:website-job-statuses(key,label)")
    .eq("id", jobId).is("archived_at", null).maybeSingle<JobRow>();
  if (jobError) throw jobError;
  if (!job) return null;
  const tasks: TaskRow[] = [];
  for (let offset = 0; ; offset += taskPageSize) {
    const { data, error } = await supabase.from("website-job-tasks")
      .select("title,source_deliverable_id,status:website-task-statuses(key)")
      .eq("job_id", jobId).eq("workspace_id", job.workspace_id).is("archived_at", null)
      .order("position").order("id").range(offset, offset + taskPageSize - 1).returns<TaskRow[]>();
    if (error) throw error;
    tasks.push(...data);
    if (data.length < taskPageSize) break;
  }
  return buildSharedJobProgress(job, tasks);
}

export function jobProgressService() {
  const service = createServiceClient();
  if (!service) throw new Error("Job progress sharing is not configured.");
  return service;
}
