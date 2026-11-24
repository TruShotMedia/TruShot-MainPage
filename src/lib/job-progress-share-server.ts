import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductionContext } from "@/lib/data/admin";
import { shareIdPattern, buildSharedJobProgress, clientDeliveryUrl, canPreviewProgressFile, type ClientJobProgress, type ProgressFileAction } from "@/lib/job-progress-share";
import { JOB_ATTACHMENT_BUCKET } from "@/lib/job-brief";
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

export function canManageJobProgress(context: NonNullable<Awaited<ReturnType<typeof getProductionContext>>>) {
  return context.access === "admin" || Boolean(context.team && context.team.role !== "marketing");
}

export async function checkJobShareAccess(jobId: string) {
  if (!shareIdPattern.test(jobId)) return { status: 404 } as const;
  const context = await getProductionContext();
  if (!context) return { status: 401 } as const;
  if (!canManageJobProgress(context)) return { status: 403 } as const;
  const { data, error } = await context.supabase.from("website-jobs").select("id")
    .eq("id", jobId).eq("workspace_id", context.membership.workspace_id).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!data) return { status: 404 } as const;
  return { status: 200, supabase: context.supabase } as const;
}

type JobRow = { title: string; workspace_id: string; deliverables: JobDeliverable[]; delivery_url?: string | null; status: { key: string; label: string } | null };
type TaskRow = { title: string; source_deliverable_id: string | null; status: { key: string } | null };
// Fetch each page deterministically, so larger jobs aren't silently truncated
// by the Data API's per-response limit.
const taskPageSize = 500;
async function readProgressJob(supabase: SupabaseClient, jobId: string, clientView = false) {
  const { data, error } = await supabase.from("website-jobs")
    .select(`title,workspace_id,deliverables,status:website-job-statuses(key,label)${clientView ? ",delivery_url" : ""}`)
    .eq("id", jobId).is("archived_at", null).maybeSingle<JobRow>();
  if (error) throw error;
  return data;
}

async function readProgressTasks(supabase: SupabaseClient, jobId: string, workspaceId: string) {
  const tasks: TaskRow[] = [];
  for (let offset = 0; ; offset += taskPageSize) {
    const { data, error } = await supabase.from("website-job-tasks")
      .select("title,source_deliverable_id,status:website-task-statuses(key)")
      .eq("job_id", jobId).eq("workspace_id", workspaceId).is("archived_at", null)
      .order("position").order("id").range(offset, offset + taskPageSize - 1).returns<TaskRow[]>();
    if (error) throw error;
    tasks.push(...data);
    if (data.length < taskPageSize) break;
  }
  return tasks;
}

export async function readJobProgressSnapshot(supabase: SupabaseClient, jobId: string) {
  const job = await readProgressJob(supabase, jobId);
  return job ? buildSharedJobProgress(job, await readProgressTasks(supabase, jobId, job.workspace_id)) : null;
}

export async function readClientJobProgressSnapshot(supabase: SupabaseClient, jobId: string): Promise<ClientJobProgress | null> {
  const job = await readProgressJob(supabase, jobId, true);
  if (!job) return null;
  const [tasks, files] = await Promise.all([
    readProgressTasks(supabase, jobId, job.workspace_id),
    supabase.from("website-job-attachments").select("id,file_name,size_bytes,mime_type")
      .eq("job_id", jobId).eq("workspace_id", job.workspace_id).eq("shared_on_progress", true)
      .is("archived_at", null).order("created_at").order("id"),
  ]);
  if (files.error) throw files.error;
  return {
    ...buildSharedJobProgress(job, tasks),
    deliveryUrl: clientDeliveryUrl(job.delivery_url ?? null),
    attachments: files.data.map(file => ({ id: file.id, name: file.file_name, size: file.size_bytes, viewable: canPreviewProgressFile(file.mime_type) })),
  };
}

export async function signProgressAttachment(supabase: SupabaseClient, jobId: string, attachmentId: string, action: ProgressFileAction) {
  // Resolve the object server-side; the requester only supplies an attachment ID.
  const { data, error } = await supabase.from("website-job-attachments")
    .select("storage_path,file_name,mime_type,job:website-jobs!inner(archived_at)")
    .eq("job_id", jobId).eq("id", attachmentId).eq("shared_on_progress", true)
    .is("archived_at", null).is("job.archived_at", null)
    .maybeSingle<{ storage_path: string; file_name: string; mime_type: string }>();
  if (error) throw error;
  if (!data || (action === "view" && !canPreviewProgressFile(data.mime_type))) return null;
  const { data: signed, error: signError } = await supabase.storage.from(JOB_ATTACHMENT_BUCKET)
    .createSignedUrl(data.storage_path, 60, action === "download" ? { download: data.file_name } : undefined);
  if (signError) throw signError;
  return signed?.signedUrl ?? null;
}

export function jobProgressService() {
  const service = createServiceClient();
  if (!service) throw new Error("Job progress sharing is not configured.");
  return service;
}
