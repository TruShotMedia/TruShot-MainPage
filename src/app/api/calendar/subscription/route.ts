import { getProductionContext } from "@/lib/data/admin";
import { createSubscription, revokeSubscription, subscriptionStatus } from "@/lib/calendar-subscription/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
async function authorised() {
  const context = await getProductionContext();
  return context && (context.access === "admin" || context.team?.role === "manager" || context.team?.role === "videographer") ? context : null;
}
export async function GET() {
  const context = await authorised();
  if (!context) return json({ error: "Sign in to AutoPacific to manage your subscription." }, 401);
  try { return json(await subscriptionStatus(context.supabase, context.claims.sub)); }
  catch { return json({ error: "Your calendar subscription could not be loaded." }, 503); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Use the calendar settings in this app." }, 403);
  const context = await authorised();
  if (!context) return json({ error: "Sign in to AutoPacific to manage your subscription." }, 401);
  if (Number(request.headers.get("content-length")) > 256) return json({ error: "Invalid calendar action." }, 413);
  try {
    const raw = await request.text();
    if (raw.length > 256) return json({ error: "Invalid calendar action." }, 413);
    const body = JSON.parse(raw);
    if (body.action === "create" || body.action === "replace") return json({ enabled: true, ...await createSubscription(context.claims.sub, body.action === "replace") });
    if (body.action === "revoke") {
      await revokeSubscription(context.claims.sub);
      return json({ enabled: false, rotated_at: null });
    }
    return json({ error: "Choose a valid calendar action." }, 400);
  } catch { return json({ error: "Your calendar link could not be updated. Close and reopen these settings, then try again." }, 400); }
}
