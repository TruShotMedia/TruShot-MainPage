import { shareIdPattern } from "@/lib/job-progress-share";
import { jobProgressService, progressJson, readClientJobProgressSnapshot, readProgressBody, sameProgressOrigin, signProgressAttachment } from "@/lib/job-progress-share-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameProgressOrigin(request)) return progressJson({ error: "Open the progress link in your browser." }, 403);
  const input = await readProgressBody(request) as { token?: unknown; pin?: unknown; file?: unknown; action?: unknown } | null;
  if (typeof input?.token !== "string" || !shareIdPattern.test(input.token) || typeof input.pin !== "string" || !/^\d{6}$/.test(input.pin)) {
    return progressJson({ error: "Open a valid progress link and enter the six-digit PIN." }, 400);
  }
  if (input.file !== undefined || input.action !== undefined) {
    if (typeof input.file !== "string" || !shareIdPattern.test(input.file) || (input.action !== "view" && input.action !== "download"))
      return progressJson({ error: "Choose a valid file action." }, 400);
  }
  const denied = () => progressJson({ error: "That PIN doesn’t match, or this link is no longer active." }, 403);
  try {
    const service = jobProgressService();
    const { data, error } = await service.rpc("check_job_progress_pin", { p_token: input.token, p_pin: input.pin }).single<{ outcome: string; verified_job: string | null }>();
    if (error) throw error;
    if (data.outcome === "limited") return progressJson({ error: "Too many attempts. Please wait up to 15 minutes before trying again." }, 429);
    if (data.outcome !== "verified" || !data.verified_job) return denied();
    if (typeof input.file === "string" && (input.action === "view" || input.action === "download")) {
      const url = await signProgressAttachment(service, data.verified_job, input.file, input.action);
      return url ? progressJson({ url }) : progressJson({ error: "This file is no longer available." }, 404);
    }
    const snapshot = await readClientJobProgressSnapshot(service, data.verified_job);
    return snapshot ? progressJson({ snapshot }) : denied();
  } catch {
    // No credentials, request data or raw database errors in logs or responses.
    return progressJson({ error: "Progress is temporarily unavailable. Please try again." }, 503);
  }
}
