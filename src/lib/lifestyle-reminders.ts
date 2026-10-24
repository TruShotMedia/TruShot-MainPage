import "server-only";

import { lifestyleNotificationLine } from "@/lib/lifestyle";
import type { PushMessage } from "@/lib/push";
import { sendPushNotifications, type StoredPushSubscription } from "@/lib/push-notifications";
import { createServiceClient } from "@/lib/supabase/service";

export type LifestyleWellnessReminderSlot = "gym" | "hydration-morning" | "hydration-afternoon";

export type LifestyleReminderProfile = {
  id: string;
  workspace_id: string;
  user_id: string;
  display_name: string;
  preferred_start_time: string;
  daily_gym_reminder_enabled: boolean;
  hydration_reminders_enabled: boolean;
};

type DueWellnessReminder = {
  profile: LifestyleReminderProfile;
  reminderDate: string;
  slot: LifestyleWellnessReminderSlot;
  scheduledFor: Date;
};

const DELIVERY_WINDOW_MS = 20 * 60_000;
const BRISBANE_OFFSET = "+10:00";
const HYDRATION_COPY = [
  { title: "Quick water check", body: "Have you had water recently? Take a proper drink and look after yourself." },
  { title: "Hydration intermission", body: "Pause for a drink of water. Future You will appreciate the tiny bit of maintenance." },
  { title: "Your water bottle has notes", body: "A polite reminder from your body: water would be excellent right about now." },
  { title: "Tiny wellbeing checkpoint", body: "Have a proper drink of water, reset your posture and take one calm breath." },
] as const;

function seededNumber(seed: string) {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function brisbaneDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timeFromMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function scheduledAt(date: string, time: string) {
  return new Date(`${date}T${time.slice(0, 5)}:00${BRISBANE_OFFSET}`);
}

export function lifestyleHydrationReminderTimes(profileId: string, date: string) {
  const morning = 9 * 60 + 30 + (seededNumber(`${profileId}:${date}:morning`) % 121);
  const afternoon = 13 * 60 + 30 + (seededNumber(`${profileId}:${date}:afternoon`) % 121);
  return {
    "hydration-morning": timeFromMinutes(morning),
    "hydration-afternoon": timeFromMinutes(afternoon),
  } as const;
}

export function buildLifestyleWellnessReminderMessage(
  profile: LifestyleReminderProfile,
  reminderDate: string,
  slot: LifestyleWellnessReminderSlot,
  occurrence: Date,
): PushMessage {
  if (slot === "gym") {
    return {
      title: lifestyleNotificationLine(`${profile.user_id}:${reminderDate}:gym`),
      body: `${profile.display_name}, have you made time for the gym today? A short, sensible session still counts.`,
      url: "/lifestyle?view=today",
      tag: "lifestyle-daily-care",
      kind: "lifestyle",
      badgeCount: 1,
      timestamp: occurrence.getTime(),
    };
  }

  const copy = HYDRATION_COPY[seededNumber(`${profile.id}:${reminderDate}:${slot}`) % HYDRATION_COPY.length];
  return {
    ...copy,
    url: "/lifestyle?view=today",
    tag: "lifestyle-daily-care",
    kind: "lifestyle",
    badgeCount: 1,
    timestamp: occurrence.getTime(),
  };
}

export function dueLifestyleWellnessReminders(
  profiles: LifestyleReminderProfile[],
  now: Date,
): DueWellnessReminder[] {
  const reminderDate = brisbaneDate(now);
  return profiles.flatMap((profile) => {
    const candidates: Array<{ slot: LifestyleWellnessReminderSlot; time: string }> = [];
    if (profile.daily_gym_reminder_enabled) {
      candidates.push({ slot: "gym", time: profile.preferred_start_time.slice(0, 5) });
    }
    if (profile.hydration_reminders_enabled) {
      const hydrationTimes = lifestyleHydrationReminderTimes(profile.id, reminderDate);
      candidates.push(
        { slot: "hydration-morning", time: hydrationTimes["hydration-morning"] },
        { slot: "hydration-afternoon", time: hydrationTimes["hydration-afternoon"] },
      );
    }
    return candidates.flatMap(({ slot, time }) => {
      const occurrence = scheduledAt(reminderDate, time);
      const age = now.getTime() - occurrence.getTime();
      return age >= 0 && age < DELIVERY_WINDOW_MS
        ? [{ profile, reminderDate, slot, scheduledFor: occurrence }]
        : [];
    });
  });
}

export async function dispatchLifestyleReminders(now = new Date()) {
  const supabase = createServiceClient();
  if (!supabase) return { status: "unconfigured" as const, due: 0, delivered: 0, failed: 0 };

  const { data: profiles, error: profileError } = await supabase
    .from("website-lifestyle-profiles")
    .select("id,workspace_id,user_id,display_name,preferred_start_time,daily_gym_reminder_enabled,hydration_reminders_enabled");
  if (profileError) throw profileError;

  const due = dueLifestyleWellnessReminders((profiles ?? []) as LifestyleReminderProfile[], now);
  let delivered = 0;
  let failed = 0;

  for (const reminder of due) {
    const { data: claimed, error: claimError } = await supabase
      .from("website-lifestyle-wellness-reminder-deliveries")
      .insert({
        workspace_id: reminder.profile.workspace_id,
        user_id: reminder.profile.user_id,
        profile_id: reminder.profile.id,
        reminder_date: reminder.reminderDate,
        reminder_slot: reminder.slot,
        scheduled_for: reminder.scheduledFor.toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (claimError?.code === "23505" || !claimed) continue;
    if (claimError) throw claimError;

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("website-lifestyle-push-subscriptions")
      .select("id,endpoint,p256dh,auth_key")
      .eq("profile_id", reminder.profile.id);
    if (subscriptionError) throw subscriptionError;

    const result = await sendPushNotifications(
      (subscriptions ?? []) as StoredPushSubscription[],
      buildLifestyleWellnessReminderMessage(
        reminder.profile,
        reminder.reminderDate,
        reminder.slot,
        reminder.scheduledFor,
      ),
    );
    delivered += result.delivered;
    failed += result.failed;
    if (result.expiredIds.length) {
      await supabase.from("website-lifestyle-push-subscriptions").delete().in("id", result.expiredIds);
    }
    await supabase
      .from("website-lifestyle-wellness-reminder-deliveries")
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
