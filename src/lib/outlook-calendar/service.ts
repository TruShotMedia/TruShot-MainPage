import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import type { CalendarCustomEvent } from "@/lib/types";
import { encryptFeedUrl, decryptFeedUrl } from "./crypto";
import { fetchOutlookFeed, OutlookFeedError, validateOutlookFeedUrl } from "./feed";
import { OUTLOOK_REFRESH_MINUTES, outlookNextSyncAt, type OutlookCalendarStatus } from "./model";

const TABLE = "website-outlook-calendars";
const SECRETS = "website-outlook-feed-secrets";
const safeColumns = "id,name,last_success_at,last_attempt_at,last_error,events";
type Snapshot = { id: string; name: string; last_success_at: string | null; last_attempt_at: string | null; last_error: string | null; events: CalendarCustomEvent[] };
function status(row: Snapshot): OutlookCalendarStatus {
  return { id: row.id, name: row.name, last_success_at: row.last_success_at, last_attempt_at: row.last_attempt_at, last_error: row.last_error, event_count: row.events.length };
}
export async function readOutlookCalendars(supabase: SupabaseClient) {
  const { data, error } = await supabase.from(TABLE).select(safeColumns).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  if (error) throw new Error("Your Outlook calendar connection could not be loaded.");
  return (data ?? []) as Snapshot[];
}
export async function getOutlookEvents(supabase: SupabaseClient) {
  return (await readOutlookCalendars(supabase)).flatMap(row => row.events);
}
export async function getOutlookStatuses(supabase: SupabaseClient) {
  return (await readOutlookCalendars(supabase)).map(status);
}
function serviceClient() {
  const service = createServiceClient();
  if (!service) throw new OutlookFeedError("Outlook calendar connections are not configured yet.");
  return service;
}
export async function connectOutlookCalendar(ownerId: string, input: { url: string; name: string }) {
  const url = validateOutlookFeedUrl(input.url);
  const encrypted = encryptFeedUrl(url);
  const service = serviceClient();
  const { data: existing, error: existingError } = await service.from(TABLE).select("id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", ownerId).maybeSingle();
  if (existingError) throw new Error("Calendar connection lookup failed");
  if (existing) throw new OutlookFeedError("You already have an Outlook connection. Disconnect it first to use a different calendar.");
  const id = randomUUID();
  const now = new Date();
  const feed = await fetchOutlookFeed(url);
  if (feed.unchanged) throw new OutlookFeedError("Outlook returned no calendar. Please try again.");
  const { parseOutlookCalendar } = await import("./parse");
  const events = await parseOutlookCalendar(feed.body, id, ownerId, input.name, now);
  const { data: row, error } = await service.from(TABLE).insert({ id, workspace_id: TRUSHOT_WORKSPACE_ID, user_id: ownerId, name: input.name, events,
    last_success_at: now.toISOString(), last_attempt_at: now.toISOString(), next_sync_at: outlookNextSyncAt(now) }).select(safeColumns).single();
  if (error) throw new OutlookFeedError("The calendar could not be connected. Please refresh and try again.");
  const { error: secretError } = await service.from(SECRETS).insert({ calendar_id: id, encrypted_url: encrypted, etag: feed.etag, last_modified: feed.last_modified, expanded_on: now.toISOString().slice(0, 10) });
  if (secretError) {
    await service.from(TABLE).delete().eq("id", id).eq("user_id", ownerId);
    throw new OutlookFeedError("The private link could not be saved. Please try again.");
  }
  return status(row as Snapshot);
}
export async function disconnectOutlookCalendar(ownerId: string, id: string) {
  const { error } = await serviceClient().from(TABLE).delete().eq("id", id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", ownerId);
  if (error) throw new Error("Calendar disconnect failed");
}
export async function syncOutlookCalendar(id: string, ownerId?: string) {
  const service = serviceClient();
  const now = new Date();
  const token = randomUUID();
  // Compare-and-set lease prevents cron/manual refresh races. Disconnect's FK
  // cascade and this token prevent an in-flight response resurrecting a feed.
  let query = service.from(TABLE).update({ lease_token: token, lease_until: new Date(now.getTime() + 60_000).toISOString(), last_attempt_at: now.toISOString() })
    .eq("id", id).eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .lt("last_attempt_at", new Date(now.getTime() - 60_000).toISOString());
  if (ownerId) query = query.eq("user_id", ownerId);
  const { data: row, error } = await query.select("id,user_id,name,events,failure_count").maybeSingle();
  if (error) throw new Error("Calendar sync claim failed");
  if (!row) return { status: "busy" as const };
  try {
    const { data: secret, error: secretError } = await service.from(SECRETS).select("encrypted_url,etag,last_modified,expanded_on").eq("calendar_id", id).single();
    if (secretError || !secret) throw new OutlookFeedError("Please reconnect your Outlook calendar to restore automatic updates.");
    const url = decryptFeedUrl(secret.encrypted_url);
    // Re-expand daily even if HTTP validators haven't changed, so recurring
    // events move into the rolling one-year import window.
    const feed = await fetchOutlookFeed(url, secret.expanded_on === now.toISOString().slice(0, 10) ? secret : {});
    const events = feed.unchanged ? row.events : await (await import("./parse")).parseOutlookCalendar(feed.body, row.id, row.user_id, row.name, now);
    const changed = JSON.stringify(events) !== JSON.stringify(row.events);
    const { error: saveError } = await service.from(TABLE).update({ ...(changed ? { events, updated_at: now.toISOString() } : {}),
      last_success_at: now.toISOString(), last_error: null, failure_count: 0, next_sync_at: outlookNextSyncAt(now), lease_token: null, lease_until: null })
      .eq("id", id).eq("lease_token", token);
    if (saveError) throw new Error("Calendar snapshot save failed");
    // Never advance HTTP validators before the snapshot commits: a failed save
    // followed by a 304 must not permanently hide an Outlook change.
    if (!feed.unchanged) await service.from(SECRETS).update({ etag: feed.etag, last_modified: feed.last_modified, expanded_on: now.toISOString().slice(0, 10) }).eq("calendar_id", id);
    return { status: "synced" as const, changed };
  } catch (error) {
    const message = error instanceof OutlookFeedError ? error.message : "Your Outlook calendar could not be refreshed. Your last saved events are still available.";
    await service.from(TABLE).update({ last_error: message, failure_count: row.failure_count + 1,
      next_sync_at: outlookNextSyncAt(now, Math.min(240, OUTLOOK_REFRESH_MINUTES * 2 ** Math.min(row.failure_count, 4))), lease_token: null, lease_until: null })
      .eq("id", id).eq("lease_token", token);
    return { status: "unavailable" as const };
  }
}
export async function dispatchOutlookCalendarSync() {
  const service = createServiceClient();
  if (!service) return { status: "not-configured" };
  const { data, error } = await service.from(TABLE).select("id").lte("next_sync_at", new Date().toISOString()).order("next_sync_at").limit(5);
  if (error) return { status: "unavailable" };
  const results = [];
  for (const row of data ?? []) results.push(await syncOutlookCalendar(row.id));
  return { processed: results.length, failed: results.filter(result => result.status === "unavailable").length };
}
