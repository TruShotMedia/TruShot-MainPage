import "server-only";

import { brisbaneOccurrence, formatBrisbaneDate } from "@/lib/calendar-reminder-logic";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { buildRecurringIngreignMarkers, INGREIGN_NOTIFICATION_TIME, manualEventToMarker, type IngreignManualEvent } from "@/lib/ingreign";
import { sendPushNotifications, type StoredPushSubscription } from "@/lib/push-notifications";
import { createServiceClient } from "@/lib/supabase/service";

export type IngreignReminderDispatchResult = {
  candidates: number;
  delivered: number;
  failed: number;
  skippedDuplicates: number;
};

async function reserveDelivery(
  scheduleKey: string,
  postingDate: string,
  supabase: NonNullable<ReturnType<typeof createServiceClient>>,
) {
  const reservation = await supabase
    .from("website-ingreign-notification-deliveries")
    .insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      schedule_key: scheduleKey,
      posting_date: postingDate,
      status: "processing",
      attempted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (!reservation.error) return { id: reservation.data.id, duplicate: false };
  if (reservation.error.code !== "23505") throw reservation.error;
  const { data: previous, error } = await supabase
    .from("website-ingreign-notification-deliveries")
    .select("id,status")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("schedule_key", scheduleKey)
    .eq("posting_date", postingDate)
    .single();
  if (error || !previous) throw error ?? new Error("The previous INGREIGN reminder could not be read.");
  if (previous.status !== "failed") return { id: previous.id, duplicate: true };
  const { data: retry, error: retryError } = await supabase
    .from("website-ingreign-notification-deliveries")
    .update({ status: "processing", attempted_at: new Date().toISOString(), error_message: null })
    .eq("id", previous.id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (retryError) throw retryError;
  return retry ? { id: retry.id, duplicate: false } : { id: previous.id, duplicate: true };
}

export async function dispatchIngreignReminders(now = new Date()): Promise<IngreignReminderDispatchResult> {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("The Supabase server key is not configured.");
  const postingDate = formatBrisbaneDate(now);
  const occurrenceAt = brisbaneOccurrence(postingDate, INGREIGN_NOTIFICATION_TIME);
  if (!occurrenceAt) return { candidates: 0, delivered: 0, failed: 0, skippedDuplicates: 0 };
  const reminderAt = occurrenceAt.getTime();
  if (reminderAt < now.getTime() - 20 * 60_000 || reminderAt >= now.getTime() + 5 * 60_000) {
    return { candidates: 0, delivered: 0, failed: 0, skippedDuplicates: 0 };
  }

  const year = Number(postingDate.slice(0, 4));
  const { data: manualRows, error: manualError } = await supabase
    .from("website-ingreign-manual-events")
    .select("id,title,calendar_label,event_date,preset_key,generator_mode,month_label,day_label,caption_override,notification_enabled,created_at,updated_at")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("event_date", postingDate)
    .eq("notification_enabled", true);
  if (manualError) throw manualError;
  const markers = [
    ...buildRecurringIngreignMarkers(year).filter((marker) => marker.date === postingDate && marker.notificationEnabled),
    ...((manualRows ?? []) as IngreignManualEvent[]).map(manualEventToMarker),
  ];
  if (!markers.length) return { candidates: 0, delivered: 0, failed: 0, skippedDuplicates: 0 };

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from("website-ingreign-push-subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  if (subscriptionError) throw subscriptionError;
  const subscriptions = (subscriptionRows ?? []) as StoredPushSubscription[];
  if (!subscriptions.length) return { candidates: markers.length, delivered: 0, failed: 0, skippedDuplicates: 0 };

  let delivered = 0;
  let failed = 0;
  let skippedDuplicates = 0;
  const expiredIds = new Set<string>();
  for (const marker of markers) {
    const reservation = await reserveDelivery(marker.id, postingDate, supabase);
    if (reservation.duplicate) { skippedDuplicates += 1; continue; }
    const result = await sendPushNotifications(subscriptions, {
      title: "INGREIGN post reminder",
      body: `${marker.calendarLabel} · Tap to create today’s post and copy its caption.`,
      url: `/ingreign/generator?${new URLSearchParams({ date: marker.date, event: marker.eventDate, preset: marker.presetKey, marker: marker.id })}`,
      tag: `ingreign-${marker.id}-${postingDate}`,
      kind: "ingreign",
      timestamp: occurrenceAt.getTime(),
    });
    result.expiredIds.forEach((id) => expiredIds.add(id));
    delivered += result.delivered;
    failed += result.failed + (result.configured ? 0 : subscriptions.length);
    const { error: updateError } = await supabase
      .from("website-ingreign-notification-deliveries")
      .update({
        status: result.configured && result.delivered > 0 ? "sent" : "failed",
        delivered_count: result.delivered,
        failed_count: result.configured ? result.failed : subscriptions.length,
        error_message: result.configured ? null : "Web Push server credentials are not configured.",
      })
      .eq("id", reservation.id);
    if (updateError) throw updateError;
  }

  if (expiredIds.size) {
    const { error } = await supabase.from("website-ingreign-push-subscriptions").delete().in("id", [...expiredIds]);
    if (error) console.error("Expired INGREIGN push subscriptions could not be removed.", error);
  }
  return { candidates: markers.length, delivered, failed, skippedDuplicates };
}

