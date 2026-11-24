export const JOB_PROGRESS_HOST = "autopac-progress.vercel.app";
export const JOB_PROGRESS_ORIGIN = `https://${JOB_PROGRESS_HOST}`;
export const JOB_PROGRESS_PATH = "/job-progress";

/** Only the approved origin can replace the old one; previews keep their own URL. */
export function jobProgressLinkOrigin(fallback: string) {
  return process.env.NEXT_PUBLIC_JOB_PROGRESS_VERCEL_LINKS === "1" ? JOB_PROGRESS_ORIGIN : fallback;
}

export function jobProgressShareUrl(token: string, fallbackOrigin: string) {
  const url = new URL(JOB_PROGRESS_PATH, jobProgressLinkOrigin(fallbackOrigin));
  url.hash = token; // Never transmit the token in a request path or query string.
  return url.href;
}
