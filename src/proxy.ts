import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { JOB_PROGRESS_HOST, JOB_PROGRESS_ORIGIN, JOB_PROGRESS_PATH } from "@/lib/job-progress-host";
import { jobProgressBrand } from "@/lib/job-progress-brand";

const progressAssets = new Set([
  jobProgressBrand.logo, jobProgressBrand.icon, "/autopacific/icons/192", "/job-progress.webmanifest",
]);

function progressHostResponse(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (request.method === "GET" || request.method === "HEAD") {
    if (pathname === "/") return NextResponse.redirect(new URL(JOB_PROGRESS_PATH, JOB_PROGRESS_ORIGIN));
    if (pathname === JOB_PROGRESS_PATH || progressAssets.has(pathname)) return NextResponse.next();
    if (pathname === "/favicon.ico") return NextResponse.redirect(new URL(jobProgressBrand.icon, JOB_PROGRESS_ORIGIN));
  }
  if (request.method === "POST" && pathname === "/api/job-progress") return NextResponse.next();
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}

export async function proxy(request: NextRequest) {
  // Match the actual Host rather than forwarded client-controlled headers.
  const host = request.headers.get("host")?.split(":", 1)[0].toLowerCase().replace(/\.$/, "");
  if (host === JOB_PROGRESS_HOST) return progressHostResponse(request);
  return updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*", "/autopacific/:path*", "/marketing/:path*", "/tablet/:path*", "/ingreign/:path*", "/lifestyle/:path*",
    // Next requires literal matchers. Exclude only the compiled static assets
    // on this hostname; the other site routes retain their existing coverage.
    { source: "/((?!_next/static/).*)", has: [{ type: "host", value: "autopac-progress\\.vercel\\.app\\.?" }] },
  ],
};
