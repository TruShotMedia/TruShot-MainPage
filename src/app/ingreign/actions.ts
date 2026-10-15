"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getIngreignContext } from "@/lib/data/ingreign";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { sendPushNotifications, type StoredPushSubscription } from "@/lib/push-notifications";

const INGREIGN_LOGIN_EMAIL = "thebuildof86@gmail.com";

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  expirationTime: z.number().int().nonnegative().nullable(),
  keys: z.object({
    p256dh: z.string().min(20).max(255),
    auth: z.string().min(10).max(255),
  }),
});

export async function signInToIngreign(formData: FormData) {
  const email = z.email().safeParse(formData.get("email"));
  const password = z.string().min(6).safeParse(formData.get("password"));
  const failure = (reason: string) => `/ingreign/login?${new URLSearchParams({ error: reason })}`;
  if (!email.success || !password.success || email.data.toLowerCase() !== INGREIGN_LOGIN_EMAIL) {
    redirect(failure("invalid"));
  }

  const supabase = await createSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  if (error) redirect(failure("credentials"));

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const { data: membership } = userId
    ? await supabase
        .from("website-portal-users")
        .select("id")
        .eq("user_id", userId)
        .eq("portal_key", "ingreign")
        .eq("is_active", true)
        .maybeSingle()
    : { data: null };
  if (!membership) {
    await supabase.auth.signOut();
    redirect(failure("access"));
  }

  revalidatePath("/ingreign", "layout");
  redirect("/ingreign");
}

export async function signOutOfIngreign() {
  const supabase = await createSupabaseClient();
  await supabase.auth.signOut();
  redirect("/ingreign/login");
}

export async function saveIngreignPushSubscription(input: unknown) {
  const context = await getIngreignContext();
  if (!context || context.access !== "portal") throw new Error("Your INGREIGN session has expired.");
  const subscription = subscriptionSchema.parse(input);
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) ?? null;
  const { error } = await context.supabase.from("website-ingreign-push-subscriptions").upsert({
    workspace_id: context.membership.workspace_id,
    user_id: context.claims.sub,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth_key: subscription.keys.auth,
    expiration_time: subscription.expirationTime,
    user_agent: userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw new Error("This device could not be registered for INGREIGN reminders.");
  revalidatePath("/ingreign/notifications");
  return { ok: true };
}

export async function removeIngreignPushSubscription(endpoint: string) {
  const context = await getIngreignContext();
  if (!context || context.access !== "portal") throw new Error("Your INGREIGN session has expired.");
  const parsedEndpoint = z.url().startsWith("https://").max(2048).parse(endpoint);
  const { error } = await context.supabase
    .from("website-ingreign-push-subscriptions")
    .delete()
    .eq("user_id", context.claims.sub)
    .eq("endpoint", parsedEndpoint);
  if (error) throw new Error("Reminders could not be disabled on this device.");
  revalidatePath("/ingreign/notifications");
  return { ok: true };
}

export async function sendIngreignTestNotification(endpoint: string) {
  const context = await getIngreignContext();
  if (!context || context.access !== "portal") throw new Error("Your INGREIGN session has expired.");
  const parsedEndpoint = z.url().startsWith("https://").max(2048).parse(endpoint);
  const { data, error } = await context.supabase
    .from("website-ingreign-push-subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .eq("user_id", context.claims.sub)
    .eq("endpoint", parsedEndpoint);
  if (error || !data?.length) throw new Error("Enable reminders on this device first.");
  const result = await sendPushNotifications(data as StoredPushSubscription[], {
    title: "INGREIGN reminders are ready",
    body: "Your content reminder is working. Tap to open the calendar.",
    url: "/ingreign",
    tag: `ingreign-test-${Date.now()}`,
    kind: "ingreign",
  });
  if (!result.configured || !result.delivered) throw new Error("The test reminder could not reach this device.");
  return { ok: true };
}

