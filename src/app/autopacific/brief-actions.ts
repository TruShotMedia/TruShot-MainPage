"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProductionContext } from "@/lib/data/admin";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import {
  JOB_ATTACHMENT_BUCKET,
  JOB_ATTACHMENT_MAX_BYTES,
  jobAttachmentTypes,
  type JobAttachment,
} from "@/lib/job-brief";

async function authorisedJob(value: string) {
  const id = z.uuid().parse(value);
  const context = await getProductionContext();
  if (!context) throw new Error("Your session has expired. Sign in again.");
  const { data, error } = await context.supabase
    .from("website-jobs")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .single();
  if (error || !data) throw new Error("This job is unavailable.");
  return { context, id };
}
export async function loadJobSupportingData(jobId: string) {
  const { context, id } = await authorisedJob(jobId);
  const [files, tasks] = await Promise.all([
    context.supabase
      .from("website-job-attachments")
      .select("id,file_name,mime_type,size_bytes,storage_path,created_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("job_id", id)
      .is("archived_at", null)
      .order("created_at"),
    context.supabase
      .from("website-job-tasks")
      .select("id,title,source_deliverable_id,completed_at,archived_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("job_id", id)
      .not("source_deliverable_id", "is", null),
  ]);
  if (files.error || tasks.error)
    throw new Error(
      "Job files and linked tasks could not be loaded. Please retry.",
    );
  const rows = files.data ?? [];
  const { data: signed, error } = rows.length
    ? await context.supabase.storage
        .from(JOB_ATTACHMENT_BUCKET)
        .createSignedUrls(
          rows.map((file) => file.storage_path),
          600,
        )
    : { data: [], error: null };
  if (error)
    throw new Error("Private file previews are temporarily unavailable.");
  const urls = new Map(
    (signed ?? []).map((file) => [file.path, file.signedUrl]),
  );
  return {
    attachments: rows.map(({ storage_path, ...file }) => ({
      ...file,
      url: urls.get(storage_path) ?? "",
    })) as JobAttachment[],
    linkedTasks: tasks.data ?? [],
  };
}
export async function registerJobAttachment(input: {
  jobId: string;
  storagePath: string;
  fileName: string;
}) {
  const { context, id } = await authorisedJob(input.jobId);
  const prefix = `${TRUSHOT_WORKSPACE_ID}/${id}/`;
  const path = z
    .string()
    .startsWith(prefix)
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/)
    .parse(input.storagePath);
  const fileName = z.string().trim().min(1).max(240).parse(input.fileName);
  const name = path.slice(prefix.length);
  const { data: objects, error: storageError } = await context.supabase.storage
    .from(JOB_ATTACHMENT_BUCKET)
    .list(prefix.slice(0, -1), { search: name, limit: 100 });
  const object = objects?.find((file) => file.name === name);
  const size = Number(object?.metadata?.size);
  const type = String(object?.metadata?.mimetype ?? "");
  if (
    storageError ||
    !object ||
    !Number.isFinite(size) ||
    size <= 0 ||
    size > JOB_ATTACHMENT_MAX_BYTES ||
    !jobAttachmentTypes.includes(type)
  )
    throw new Error(
      "The uploaded file could not be verified. Please use an accepted file under 50 MB.",
    );
  const { error } = await context.supabase
    .from("website-job-attachments")
    .upsert(
      {
        workspace_id: TRUSHOT_WORKSPACE_ID,
        job_id: id,
        storage_path: path,
        file_name: fileName,
        mime_type: type,
        size_bytes: size,
      },
      { onConflict: "storage_path", ignoreDuplicates: true },
    );
  if (error)
    throw new Error(
      "The file uploaded, but its attachment record could not be saved. Retry to reconnect it.",
    );
  revalidatePath("/marketing");
  revalidatePath("/autopacific");
}
export async function removeJobAttachment(jobId: string, attachmentId: string) {
  const { context, id } = await authorisedJob(jobId);
  const { data, error } = await context.supabase
    .from("website-job-attachments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.uuid().parse(attachmentId))
    .eq("job_id", id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .select("id")
    .single();
  if (error || !data) throw new Error("This attachment could not be removed.");
  revalidatePath("/marketing");
  revalidatePath("/autopacific");
}
export async function approveProductionTask(taskId: string) {
  const context = await getProductionContext();
  if (!context) throw new Error("Your session has expired. Sign in again.");
  const { error } = await context.supabase.rpc(
    "website-approve-production-task",
    { p_task_id: z.uuid().parse(taskId) },
  );
  if (error) throw new Error(error.message);
  for (const path of [
    "/marketing",
    "/autopacific",
    "/autopacific/mobile",
    "/tablet",
    "/admin/tasks",
    "/admin/calendar",
  ])
    revalidatePath(path);
}

export async function loadJobBriefHistory(jobId: string) {
  const { context, id } = await authorisedJob(jobId);
  const { data, error } = await context.supabase
    .from("website-jobs")
    .select("brief_history")
    .eq("id", id)
    .single();
  if (error || !data)
    throw new Error("Previous brief revisions could not be loaded.");
  return data.brief_history as Array<{
    saved_at: string;
    brief_details: import("@/lib/job-brief").JobBrief;
    description: string | null;
    deliverables: import("@/lib/job-deliverable-model").JobDeliverable[];
  }>;
}
