import { NextResponse } from "next/server";
import { z } from "zod";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";

const allowedEvents = ["page_view", "cta_click", "pricing_view", "package_select", "form_start", "enquiry_submit", "heartbeat", "scroll_depth"] as const;
const attributionSchema = z.object({
  landing_path: z.string().max(300).optional(),
  referrer_domain: z.string().max(253).nullable().optional(),
  device_class: z.enum(["mobile", "tablet", "desktop"]).optional(),
  first_seen_at: z.string().datetime().optional(),
  utm: z.object({ source: z.string().max(180).optional(), medium: z.string().max(180).optional(), campaign: z.string().max(180).optional(), term: z.string().max(180).optional(), content: z.string().max(180).optional() }).optional(),
}).optional();
const payloadSchema = z.object({
  anonymousId: z.string().uuid(),
  eventName: z.enum(allowedEvents),
  pagePath: z.string().max(300),
  analyticsKey: z.string().max(180).optional(),
  section: z.string().max(100).optional(),
  packageSlug: z.string().max(100).optional(),
  deviceClass: z.enum(["mobile", "tablet", "desktop"]).optional(),
  attribution: attributionSchema,
  properties: z.object({ activeSeconds: z.number().int().min(0).max(86400).optional() }).optional(),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) { attempts.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1;
  return current.count > 120;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_192) return new NextResponse(null, { status: 413 });
  const source = request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local";
  if (isRateLimited(source)) return new NextResponse(null, { status: 429 });

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const data = parsed.data;
  const supabase = createPublicClient();
  const activeSeconds = data.properties?.activeSeconds ?? 0;
  const { error } = await supabase.rpc("website-record-analytics-event", {
    p_workspace_id: TRUSHOT_WORKSPACE_ID,
    p_anonymous_id: data.anonymousId,
    p_event_name: data.eventName,
    p_page_path: data.pagePath,
    p_analytics_key: data.analyticsKey ?? null,
    p_section: data.section ?? null,
    p_package_slug: data.packageSlug ?? null,
    p_device_class: data.deviceClass ?? null,
    p_active_seconds: activeSeconds,
    p_attribution: data.attribution ?? {},
    p_properties: data.properties ?? {},
  });
  if (error) return new NextResponse(null, { status: 503 });

  return new NextResponse(null, { status: 204 });
}
