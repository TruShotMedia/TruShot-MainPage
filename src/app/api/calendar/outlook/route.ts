import { getProductionContext } from "@/lib/data/admin";
import { connectOutlookCalendar, disconnectOutlookCalendar, getOutlookStatuses, syncOutlookCalendar } from "@/lib/outlook-calendar/service";
import { OutlookFeedError } from "@/lib/outlook-calendar/feed";
import { readOutlookBridgeStatus } from "@/lib/clickup/outlook-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export async function GET() {
  const context = await getProductionContext();
  if (!context) return json({ error: "Sign in to manage your calendar connection." }, 401);
  try {
    const [calendars,bridge]=await Promise.all([getOutlookStatuses(context.supabase),readOutlookBridgeStatus(context.claims.sub)]);
    return json({calendars,bridge});
  }
  catch { return json({ error: "Your Outlook connection could not be loaded." }, 503); }
}
export async function POST(request: Request) {
  // Cookie auth requires same-origin mutations; never put the bearer URL into
  // a query string, redirect, error message, telemetry or response.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return json({ error: "Please use the connection settings in this app." }, 403);
  const context = await getProductionContext();
  if (!context) return json({ error: "Sign in to manage your calendar connection." }, 401);
  if (Number(request.headers.get("content-length")) > 6000) return json({ error: "The calendar link is too long." }, 413);
  try {
    const raw = await request.text();
    if (raw.length > 6000) return json({ error: "The calendar link is too long." }, 413);
    const body = JSON.parse(raw);
    if (body.action === "connect") {
      if (typeof body.url !== "string" || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) return json({ error: "Enter a calendar name and its private ICS link." }, 400);
      await connectOutlookCalendar(context.claims.sub, { url: body.url, name: body.name.trim() });
    } else if ((body.action === "refresh" || body.action === "disconnect") && typeof body.id === "string" && /^[\da-f-]{36}$/i.test(body.id)) {
      if (body.action === "disconnect") await disconnectOutlookCalendar(context.claims.sub, body.id);
      else {
        const result = await syncOutlookCalendar(body.id, context.claims.sub);
        if (result.status === "busy") return json({ error: "A refresh has just run. Please wait a minute before trying again." }, 429);
      }
    } else return json({ error: "Choose a valid calendar action." }, 400);
    return json({ calendars: await getOutlookStatuses(context.supabase) });
  } catch (error) {
    return json({ error: error instanceof OutlookFeedError ? error.message : "The calendar connection could not be updated. Please try again." }, 400);
  }
}
