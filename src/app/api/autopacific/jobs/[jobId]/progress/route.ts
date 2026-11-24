import { checkJobShareAccess, jobProgressService, progressJson, readJobProgressSnapshot, readProgressBody, sameProgressOrigin } from "@/lib/job-progress-share-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };
const denied = (status: number) => progressJson({ error: "You don’t have access to share this job." }, status);
const unavailable = () => progressJson({ error: "Job progress sharing is temporarily unavailable." }, 503);

export async function GET(request: Request, { params }: Context) {
  try {
    const { jobId } = await params;
    const access = await checkJobShareAccess(jobId);
    if (access.status !== 200) return denied(access.status);
    if (new URL(request.url).searchParams.get("format") === "snapshot") {
      const snapshot = await readJobProgressSnapshot(access.supabase, jobId);
      if (!snapshot) return denied(404);
      return progressJson({ snapshot });
    }
    const { data, error } = await jobProgressService().from("website_job_progress_shares")
      .select("pin,enabled").eq("job_id", jobId).single();
    if (error) throw error;
    return progressJson(data);
  } catch { return unavailable(); }
}

export async function POST(request: Request, { params }: Context) {
  if (!sameProgressOrigin(request)) return denied(403);
  const body = await readProgressBody(request) as { action?: unknown } | null;
  if (body?.action !== "share" && body?.action !== "revoke") return progressJson({ error: "Choose a valid sharing action." }, 400);
  try {
    const { jobId } = await params;
    const access = await checkJobShareAccess(jobId);
    if (access.status !== 200) return denied(access.status);
    const service = jobProgressService();
    if (body.action === "revoke") {
      const { data: revoked, error: revokeError } = await service.rpc("revoke_job_progress_share", { p_job: jobId });
      if (revokeError || !revoked) throw revokeError ?? new Error("Missing job share");
      const { data, error } = await service.from("website_job_progress_shares").select("pin,enabled").eq("job_id", jobId).single();
      if (error) throw error;
      return progressJson(data);
    }
    const { data, error } = await service.rpc("enable_job_progress_share", { p_job: jobId }).maybeSingle();
    if (error) throw error;
    if (!data) return denied(404);
    return progressJson(data);
  } catch { return unavailable(); }
}
