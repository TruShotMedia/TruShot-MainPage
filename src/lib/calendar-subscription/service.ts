import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL, TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { serializeCalendar, type SubscriptionEvent } from "./ical";

const TABLE = "website-calendar-subscriptions";
export function hashSubscriptionToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function service() {
  const client = createServiceClient();
  if (!client) throw new Error("Calendar subscription unavailable");
  return client;
}
export async function subscriptionStatus(supabase: SupabaseClient, owner: string) {
  const { data, error } = await supabase.from(TABLE).select("id,rotated_at")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", owner).maybeSingle();
  if (error) throw new Error("Calendar subscription unavailable");
  return data ? { enabled: true, rotated_at: data.rotated_at as string } : { enabled: false, rotated_at: null };
}
export async function createSubscription(owner: string, replace: boolean) {
  const client = service();
  const token = randomBytes(32).toString("hex");
  const record = { workspace_id: TRUSHOT_WORKSPACE_ID, user_id: owner, token_hash: hashSubscriptionToken(token), rotated_at: new Date().toISOString() };
  // Creating never silently invalidates an existing link; replacement is explicit.
  const query = replace ? client.from(TABLE).upsert(record, { onConflict: "workspace_id,user_id" }) : client.from(TABLE).insert(record);
  const { error } = await query;
  if (error) throw new Error("Calendar subscription could not be created");
  // Only returned in this authenticated POST response, never persisted plaintext.
  return { url: `${SITE_URL}/api/calendar/feed.ics?key=${token}`, rotated_at: record.rotated_at };
}
export async function revokeSubscription(owner: string) {
  const { error } = await service().from(TABLE).delete().eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", owner);
  if (error) throw new Error("Calendar subscription could not be revoked");
}
export async function readSubscription(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  // One bounded DB query, no per-event network calls, scheduler or write-on-read.
  // The service-only RPC rechecks the owner's active account/permissions on
  // every request and returns only explicit, minimal native AutoPacific fields.
  const { data, error } = await service().rpc("website-read-calendar-subscription", { p_token_hash: hashSubscriptionToken(token) });
  if (error) throw new Error("Calendar subscription unavailable");
  if (!data) return null;
  const events = data.events as SubscriptionEvent[];
  if (!Array.isArray(events) || events.length > 4000) throw new Error("Calendar subscription limit exceeded");
  const body = serializeCalendar(events);
  return { body, etag: `"${createHash("sha256").update(body).digest("hex")}"` };
}
