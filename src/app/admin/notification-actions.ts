"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildCalendarReminderPushMessage, type DueCalendarReminder } from "@/lib/calendar-reminder-logic";
import { getAdminContext } from "@/lib/data/admin";
import type { PushMessage } from "@/lib/push";
import { sendPushNotifications, type StoredPushSubscription } from "@/lib/push-notifications";

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  expirationTime: z.number().int().nonnegative().nullable(),
  keys: z.object({
    p256dh: z.string().min(20).max(255),
    auth: z.string().min(10).max(255),
  }),
});

export async function savePushSubscription(input: unknown) {
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  const subscription = subscriptionSchema.parse(input);
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) ?? null;
  const userId = context.claims.sub;
  if (!userId) throw new Error("Your admin session could not be verified.");

  const { error } = await context.supabase.from("website-push-subscriptions").upsert(
    {
      workspace_id: context.membership.workspace_id,
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth_key: subscription.keys.auth,
      expiration_time: subscription.expirationTime,
      user_agent: userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error("This device could not be registered for notifications.");

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  const parsedEndpoint = z.url().startsWith("https://").max(2048).parse(endpoint);
  const userId = context.claims.sub;
  if (!userId) throw new Error("Your admin session could not be verified.");

  const { error } = await context.supabase
    .from("website-push-subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", parsedEndpoint);
  if (error) throw new Error("Notifications could not be disabled for this device.");

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function sendTestPushNotification(endpoint: string, experience: "autopacific" | "trushot" = "trushot") {
  const notificationExperience = z.enum(["autopacific", "trushot"]).parse(experience);
  const isAutopacific = notificationExperience === "autopacific";
  return sendTestNotification(endpoint, {
    title: `${isAutopacific ? "AutoPacific" : "TruShot"} notifications are ready`,
    body: "Calendar, flight and client-request alerts are enabled on this device.",
    url: isAutopacific ? "/autopacific?view=calendar" : "/admin/settings",
    tag: `notification-test-${Date.now()}`,
    badgeCount: 1,
    ...(isAutopacific ? { kind: "autopacific" as const } : {}),
  });
}

export async function sendTestFlightPushNotification(endpoint: string) {
  const now = new Date();
  const occurrenceAt = new Date(now.getTime() + 180 * 60_000);
  const localTime = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(occurrenceAt);
  const reminder: DueCalendarReminder = {
    workspaceId: "test",
    entityId: "flight-briefing-test",
    kind: "flight_departure",
    title: "TruShot flight briefing test",
    date: "2026-01-01",
    time: "09:00:00",
    context: "Brisbane · BNE → Sydney · SYD",
    reminderOffsetsMinutes: [180],
    flightDetails: {
      airline: "Qantas",
      flightNumber: "QF 501",
      route: "Brisbane · BNE → Sydney · SYD",
      localTime,
      terminal: "Domestic 3",
      travelClass: "Economy",
      seatNumber: "14A",
      onwardDetails: null,
    },
    occurrenceAt,
    reminderAt: now,
    offsetMinutes: 180,
  };
  const message = buildCalendarReminderPushMessage(reminder);
  return sendTestNotification(endpoint, {
    ...message,
    url: "/admin/settings",
    tag: `flight-notification-test-${Date.now()}`,
  });
}

async function sendTestNotification(endpoint: string, message: PushMessage) {
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  const userId = context.claims.sub;
  if (!userId) throw new Error("Your admin session could not be verified.");
  const parsedEndpoint = z.url().startsWith("https://").max(2048).parse(endpoint);

  const { data, error } = await context.supabase
    .from("website-push-subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .eq("user_id", userId)
    .eq("workspace_id", context.membership.workspace_id)
    .eq("endpoint", parsedEndpoint);
  if (error) throw new Error("Registered devices could not be loaded.");
  if (!data?.length) throw new Error("Enable notifications on this device first.");

  const result = await sendPushNotifications(data as StoredPushSubscription[], message);
  if (!result.configured) throw new Error("Server notification credentials have not been configured.");

  if (result.expiredIds.length) {
    await context.supabase.from("website-push-subscriptions").delete().in("id", result.expiredIds);
  }
  if (!result.delivered) throw new Error("The test alert could not reach a registered device.");

  revalidatePath("/admin/settings");
  return { ok: true, delivered: result.delivered };
}
