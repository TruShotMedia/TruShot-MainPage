import { getProductionContext } from "@/lib/data/admin";
import { dispatchOutlookClickUpSync, readOutlookBridgeStatus } from "@/lib/clickup/outlook-sync";
import { getOutlookStatuses, syncOutlookCalendar } from "@/lib/outlook-calendar/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
const headers = { "Cache-Control":"private, no-store", Vary:"Cookie", "X-Content-Type-Options":"nosniff" };
const json = (body: unknown,status=200) => Response.json(body,{ status,headers });
export async function GET() {
  const context=await getProductionContext();
  if (!context) return json({error:"Sign in to view your Outlook sync."},401);
  try { return json({bridge:await readOutlookBridgeStatus(context.claims.sub)}); }
  catch { return json({error:"Outlook sync status is unavailable."},503); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin")!==new URL(request.url).origin) return json({error:"Use the Outlook settings in this app."},403);
  const context=await getProductionContext();
  if (!context) return json({error:"Sign in to sync your Outlook events."},401);
  try {
    const bridge=await readOutlookBridgeStatus(context.claims.sub);
    if (!bridge?.enabled) return json({error:"ClickUp sharing is not enabled for your Outlook calendar."},403);
    const calendars=await getOutlookStatuses(context.supabase);
    for (const calendar of calendars) await syncOutlookCalendar(calendar.id,context.claims.sub);
    return json({result:await dispatchOutlookClickUpSync(context.claims.sub),bridge:await readOutlookBridgeStatus(context.claims.sub)});
  } catch { return json({error:"Outlook events could not be synced. Please try again later."},503); }
}
