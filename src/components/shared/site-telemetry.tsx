"use client";

import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

function isProgressPage(url: string) {
  return new URL(url, window.location.origin).pathname.replace(/\/$/, "") === "/job-progress";
}

export function SiteTelemetry() {
  // The share link has a bearer token in its fragment. Never record this page.
  const path = usePathname();
  if (path === "/job-progress" || path?.startsWith("/job-progress/")) return null;
  return <>
    <Analytics beforeSend={event => isProgressPage(event.url) ? null : event} />
    <SpeedInsights beforeSend={event => isProgressPage(event.url) ? null : event} />
  </>;
}
