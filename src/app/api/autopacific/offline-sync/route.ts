import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scheduleClickUpJobSync } from "@/lib/clickup/job-sync";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getProductionContext } from "@/lib/data/admin";
import { nextTaskPosition } from "@/lib/task-position";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

const mutationSchema = z.object({
  clientMutationId: z.string().uuid(),
  entity: z.enum(["job", "task"]),
  // PostgREST preserves the database timestamp format, which may use a +00
  // offset rather than a trailing Z. Treat it as an opaque revision token.
  expectedUpdatedAt: z.string().min(10).max(80),
  recordId: z.string().uuid(),
  statusId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  createdAt: z.string().min(10).max(80),
});

const bodySchema = z.object({ mutations: z.array(mutationSchema).min(1).max(25) });

type Mutation = z.infer<typeof mutationSchema>;

async function getAutopacificClientId(context: NonNullable<Awaited<ReturnType<typeof getProductionContext>>>) {
  const { data, error } = await context.supabase
    .from("website-clients")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("name", "Autopacific Group")
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) throw new Error("AutoPacific Group is unavailable.");
  return data.id;
}

async function getNextPosition(context: NonNullable<Awaited<ReturnType<typeof getProductionContext>>>, statusId: string) {
  const { data, error } = await context.supabase
    .from("website-job-tasks")
    .select("position")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("status_id", statusId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  return nextTaskPosition(data?.[0]?.position);
}

async function syncJobMutation(context: NonNullable<Awaited<ReturnType<typeof getProductionContext>>>, clientId: string, mutation: Mutation) {
  const { data: status, error: statusError } = await context.supabase
    .from("website-job-statuses")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("id", mutation.statusId)
    .eq("is_active", true)
    .maybeSingle();
  if (statusError || !status) return "rejected" as const;

  const { data, error } = await context.supabase
    .from("website-jobs")
    .update({ status_id: mutation.statusId, updated_by: context.claims.sub })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("client_id", clientId)
    .eq("id", mutation.recordId)
    .eq("updated_at", mutation.expectedUpdatedAt)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data ? "synced" as const : "conflict" as const;
}

async function syncTaskMutation(context: NonNullable<Awaited<ReturnType<typeof getProductionContext>>>, clientId: string, mutation: Mutation) {
  const [{ data: task, error: taskError }, { data: status, error: statusError }] = await Promise.all([
    context.supabase
      .from("website-job-tasks")
      .select("job_id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("id", mutation.recordId)
      .is("archived_at", null)
      .maybeSingle(),
    context.supabase
      .from("website-task-statuses")
      .select("id,key")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("id", mutation.statusId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (taskError || statusError || !task || !status) return "rejected" as const;

  const { data: job, error: jobError } = await context.supabase
    .from("website-jobs")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("id", task.job_id)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .maybeSingle();
  if (jobError || !job) return "rejected" as const;

  const position = await getNextPosition(context, mutation.statusId);
  const { data, error } = await context.supabase
    .from("website-job-tasks")
    .update({
      status_id: mutation.statusId,
      position,
      completed_at: status.key === "posted_done" ? new Date().toISOString() : null,
      updated_by: context.claims.sub,
    })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("id", mutation.recordId)
    .eq("updated_at", mutation.expectedUpdatedAt)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data ? "synced" as const : "conflict" as const;
}

function revalidateWorkspace() {
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/overview");
  revalidatePath("/tablet");
  revalidatePath("/autopacific");
  revalidatePath("/autopacific/mobile");
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid offline changes." }, { status: 400, headers: responseHeaders });

  const context = await getProductionContext();
  if (!context) return Response.json({ error: "Sign in again before syncing field changes." }, { status: 401, headers: responseHeaders });

  try {
    const clientId = await getAutopacificClientId(context);
    const results: Array<{ clientMutationId: string; status: "synced" | "conflict" | "rejected" }> = [];
    let didSyncJob = false;

    for (const mutation of parsed.data.mutations) {
      const status = mutation.entity === "job"
        ? await syncJobMutation(context, clientId, mutation)
        : await syncTaskMutation(context, clientId, mutation);
      didSyncJob ||= status === "synced" && mutation.entity === "job";
      results.push({ clientMutationId: mutation.clientMutationId, status });
    }

    if (results.some((result) => result.status === "synced")) revalidateWorkspace();
    if (didSyncJob) scheduleClickUpJobSync();
    return Response.json({ results }, { headers: responseHeaders });
  } catch (error) {
    console.error("AutoPacific offline sync failed.", error);
    return Response.json({ error: "Queued field changes could not be synced yet." }, { status: 503, headers: responseHeaders });
  }
}
