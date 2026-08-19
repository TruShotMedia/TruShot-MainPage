import { NextResponse } from "next/server";
import { z } from "zod";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";

const allowedEvents = ["page_view", "cta_click", "pricing_view", "package_select", "form_start", "enquiry_submit", "heartbeat", "scroll_depth"] as const;
const payloadSchema = z.object({
  anonymousId: z.string().uuid(),
  eventName: z.enum(allowedEvents),
  pagePath: z.string().max(300),
  analyticsKey: z.string().max(180).optional(),
  section: z.string().max(100).optional(),
  packageSlug: z.string().max(100).optional(),
  deviceClass: z.enum(["mobile", "tablet", "desktop"]).optional(),
  properties: z.object({ activeSeconds: z.number().int().min(0).max(86400).optional() }).optional(),
});

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_192) return new NextResponse(null, { status: 413 });

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const data = parsed.data;
  const supabase = createPublicClient();
  const activeSeconds = data.properties?.activeSeconds ?? 0;
  const referrer = request.headers.get("referer");
  let referrerDomain: string | null = null;
  try { referrerDomain = referrer ? new URL(referrer).hostname : null; } catch { /* discard malformed referrers */ }

  if (data.eventName === "page_view") {
    await supabase.from("website-analytics-sessions").insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      anonymous_id: data.anonymousId,
      active_seconds: 0,
      landing_path: data.pagePath,
      referrer_domain: referrerDomain,
      device_class: data.deviceClass ?? null,
      viewport_bucket: data.deviceClass ?? null,
    });
  } else if (data.eventName === "heartbeat") {
    await supabase
      .from("website-analytics-sessions")
      .update({ last_seen_at: new Date().toISOString(), active_seconds: activeSeconds })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("anonymous_id", data.anonymousId);
  }

  await supabase.from("website-analytics-events").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    anonymous_id: data.anonymousId,
    event_name: data.eventName,
    page_path: data.pagePath,
    analytics_key: data.analyticsKey ?? null,
    section: data.section ?? null,
    package_slug: data.packageSlug ?? null,
    properties: data.properties ?? {},
  });

  return new NextResponse(null, { status: 204 });
}
