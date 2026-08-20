import { NextResponse } from "next/server";
import { z } from "zod";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  businessName: z.string().trim().max(160).optional().default(""),
  email: z.email().max(254),
  phone: z.string().trim().max(40).optional().default(""),
  packageId: z.string().uuid().or(z.literal("")).optional().default(""),
  message: z.string().trim().max(5000).optional().default(""),
  consent: z.literal("true"),
  company_website: z.string().max(0).optional().default(""),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 5;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 20_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });

  const source = request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(source)) return NextResponse.json({ error: "Please try again later" }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the form details" }, { status: 400 });

  const supabase = createPublicClient();
  const { data: websiteSettings, error: settingsError } = await supabase
    .from("website-settings")
    .select("show_pricing")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .maybeSingle();
  if (settingsError) return NextResponse.json({ error: "Unable to check website settings" }, { status: 503 });

  const showPricing = websiteSettings?.show_pricing !== false;
  let packageId: string | null = null;
  let pricingVersionId: string | null = null;
  if (showPricing && parsed.data.packageId) {
    const { data: selectedPackage } = await supabase
      .from("website-pricing-packages")
      .select("version_id")
      .eq("id", parsed.data.packageId)
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("is_active", true)
      .maybeSingle();
    if (!selectedPackage) return NextResponse.json({ error: "That package is no longer available" }, { status: 400 });
    packageId = parsed.data.packageId;
    pricingVersionId = selectedPackage.version_id;
  }

  const { error } = await supabase.from("website-enquiries").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    package_id: packageId,
    pricing_version_id: pricingVersionId,
    name: parsed.data.name,
    business_name: parsed.data.businessName || null,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone || null,
    message: parsed.data.message || null,
    source_path: "/",
    attribution: {},
    consent_at: new Date().toISOString(),
    status: "new",
  });

  if (error) return NextResponse.json({ error: "Unable to save enquiry" }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
