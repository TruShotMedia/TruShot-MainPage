import "server-only";

import { lifestyleNotificationLine } from "@/lib/lifestyle";
import { sendPushNotifications, type StoredPushSubscription } from "@/lib/push-notifications";
import { createServiceClient } from "@/lib/supabase/service";

type ReminderSession = {
  id: string;
  workspace_id: string;
  user_id: string;
  session_date: string;
  start_time: string;
  title: string;
  focus: string;
};

type ReminderProfile = {
  user_id: string;
  reminder_offsets_minutes: number[];
};

function sessionStart(session: ReminderSession) {
  return new Date(`${session.session_date}T${session.start_time.slice(0, 5)}:00+10:00`);
}

export function buildLifestyleReminderMessage(session: ReminderSession, offsetMinutes: number) {
  const time = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(sessionStart(session));
  const timing = offsetMinutes === 0 ? `It starts now · ${time}` : `${session.title} at ${time}`;
  return {
    title: lifestyleNotificationLine(`${session.id}:${offsetMinutes}`),
    body: `${timing}. ${session.focus}`,
    url: `/lifestyle?view=today&session=${encodeURIComponent(session.id)}`,
    tag: `lifestyle-workout-${session.id}`,
    kind: "lifestyle" as const,
    badgeCount: 1,
    timestamp: sessionStart(session).getTime(),
  };
}

export async function dispatchLifestyleReminders(now = new Date()) {
  const supabase = createServiceClient();
  if (!supabase) return { status: "unconfigured" as const, delivered: 0, failed: 0 };
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now.getTime() + 24 * 60 * 60_000));

  const [{ data: sessions, error: sessionError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase
      .from("website-lifestyle-workout-sessions")
      .select("id,workspace_id,user_id,session_date,start_time,title,focus")
      .eq("status", "scheduled")
      .gte("session_date", today)
      .lte("session_date", tomorrow),
    supabase
      .from("website-lifestyle-profiles")
      .select("user_id,reminder_offsets_minutes"),
  ]);
  if (sessionError || profileError) throw sessionError ?? profileError;
  const profileByUser = new Map(((profiles ?? []) as ReminderProfile[]).map((profile) => [profile.user_id, profile]));
  const due = ((sessions ?? []) as ReminderSession[]).flatMap((session) => {
    const offsets = profileByUser.get(session.user_id)?.reminder_offsets_minutes ?? [];
    return offsets.flatMap((offsetMinutes) => {
      const reminderAt = new Date(sessionStart(session).getTime() - offsetMinutes * 60_000);
      const age = now.getTime() - reminderAt.getTime();
      return age >= 0 && age < 20 * 60_000 ? [{ session, offsetMinutes, reminderAt }] : [];
    });
  });

  let delivered = 0;
  let failed = 0;
  for (const reminder of due) {
    const { data: claimed, error: claimError } = await supabase
      .from("website-lifestyle-reminder-deliveries")
      .insert({
        workspace_id: reminder.session.workspace_id,
        user_id: reminder.session.user_id,
        session_id: reminder.session.id,
        offset_minutes: reminder.offsetMinutes,
        reminder_at: reminder.reminderAt.toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (claimError?.code === "23505" || !claimed) continue;
    if (claimError) throw claimError;

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("website-lifestyle-push-subscriptions")
      .select("id,endpoint,p256dh,auth_key")
      .eq("user_id", reminder.session.user_id);
    if (subscriptionError) throw subscriptionError;
    const result = await sendPushNotifications(
      (subscriptions ?? []) as StoredPushSubscription[],
      buildLifestyleReminderMessage(reminder.session, reminder.offsetMinutes),
    );
    delivered += result.delivered;
    failed += result.failed;
    if (result.expiredIds.length) {
      await supabase.from("website-lifestyle-push-subscriptions").delete().in("id", result.expiredIds);
    }
    await supabase
      .from("website-lifestyle-reminder-deliveries")
      .update({
        status: result.delivered > 0 ? "sent" : "failed",
        delivered_count: result.delivered,
        failed_count: result.failed,
        error_message: result.configured ? null : "Push notification credentials are unavailable.",
      })
      .eq("id", claimed.id);
  }

  return { status: "ready" as const, due: due.length, delivered, failed };
}

