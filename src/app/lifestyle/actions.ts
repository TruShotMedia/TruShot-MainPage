"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ensureLifestyleProfiles,
  ensureLifestyleSchedule,
  getActiveLifestyleProfile,
  getLifestyleContext,
  isLifestyleProfileKey,
  LIFESTYLE_PROFILE_COOKIE,
  type LifestyleProfile,
} from "@/lib/data/lifestyle";
import { LIFESTYLE_LOGIN_EMAIL, preferredDaysForFrequency } from "@/lib/lifestyle";
import { sendPushNotifications, type StoredPushSubscription } from "@/lib/push-notifications";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  expirationTime: z.number().int().nonnegative().nullable(),
  keys: z.object({ p256dh: z.string().min(20).max(255), auth: z.string().min(10).max(255) }),
});

const settingsSchema = z.object({
  programStyle: z.enum(["upper_lower", "full_body"]),
  daysPerWeek: z.number().int().min(2).max(5),
  sessionDurationMinutes: z.number().int().min(30).max(120),
  preferredStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  dailyGymReminderEnabled: z.boolean(),
  hydrationRemindersEnabled: z.boolean(),
  heightCm: z.number().min(100).max(250).nullable(),
  weightKg: z.number().min(30).max(300).nullable(),
  safetyAcknowledged: z.boolean(),
});

const exerciseLogSchema = z.object({
  exerciseId: z.uuid(),
  completed: z.boolean(),
  completedSets: z.number().int().min(0).max(8),
  weightKg: z.number().min(0).max(1000).nullable(),
  repsCompleted: z.number().int().min(0).max(500).nullable(),
});

function lifestyleToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function requireLifestyleContext() {
  const context = await getLifestyleContext();
  if (!context) throw new Error("Your Lifestyle session has expired. Sign in again.");
  return context;
}

async function requireLifestyleProfile() {
  const context = await requireLifestyleContext();
  const profile = await getActiveLifestyleProfile(context);
  if (!profile) throw new Error("Choose a Lifestyle profile before changing your plan.");
  return { context, profile };
}

export async function signInToLifestyle(formData: FormData) {
  const password = z.string().min(6).safeParse(formData.get("password"));
  const failure = (reason: string) => `/lifestyle/login?${new URLSearchParams({ error: reason })}`;
  if (!password.success) redirect(failure("invalid"));
  const supabase = await createSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email: LIFESTYLE_LOGIN_EMAIL, password: password.data });
  if (error) redirect(failure("credentials"));
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.email !== "string" || data.claims.email.toLowerCase() !== LIFESTYLE_LOGIN_EMAIL) {
    await supabase.auth.signOut();
    redirect(failure("access"));
  }
  redirect("/lifestyle");
}

export async function signOutOfLifestyle() {
  const supabase = await createSupabaseClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(LIFESTYLE_PROFILE_COOKIE);
  redirect("/lifestyle/login");
}

export async function selectLifestyleProfile(input: unknown) {
  if (!isLifestyleProfileKey(input)) throw new Error("That Lifestyle profile is unavailable.");
  const context = await requireLifestyleContext();
  await ensureLifestyleProfiles(context);
  const cookieStore = await cookies();
  cookieStore.set(LIFESTYLE_PROFILE_COOKIE, input, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/lifestyle",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/lifestyle");
  return { ok: true };
}

export async function saveLifestyleSettings(input: unknown) {
  const values = settingsSchema.parse(input);
  if (!values.safetyAcknowledged) throw new Error("Please acknowledge the training safety note before generating your plan.");
  const { context, profile: activeProfile } = await requireLifestyleProfile();
  const preferredDays = preferredDaysForFrequency(values.daysPerWeek);
  const now = new Date().toISOString();
  const { data: profile, error } = await context.supabase
    .from("website-lifestyle-profiles")
    .update({
      program_style: values.programStyle,
      days_per_week: values.daysPerWeek,
      session_duration_minutes: values.sessionDurationMinutes,
      preferred_start_time: values.preferredStartTime,
      preferred_days: preferredDays,
      daily_gym_reminder_enabled: values.dailyGymReminderEnabled,
      hydration_reminders_enabled: values.hydrationRemindersEnabled,
      height_cm: values.heightCm,
      weight_kg: values.weightKg,
      safety_acknowledged_at: now,
    })
    .eq("id", activeProfile.id)
    .select("id,workspace_id,user_id,profile_key,display_name,program_style,days_per_week,session_duration_minutes,preferred_start_time,preferred_days,reminder_offsets_minutes,daily_gym_reminder_enabled,hydration_reminders_enabled,height_cm,weight_kg,training_goal,experience_level,focus_areas,safety_acknowledged_at")
    .single();
  if (error || !profile) throw new Error(`Lifestyle settings could not be saved: ${error?.message ?? "Unknown error"}`);

  const { error: deleteError } = await context.supabase
    .from("website-lifestyle-workout-sessions")
    .delete()
    .eq("profile_id", activeProfile.id)
    .eq("status", "scheduled")
    .gt("session_date", lifestyleToday());
  if (deleteError) throw new Error(`The future plan could not be refreshed: ${deleteError.message}`);
  await ensureLifestyleSchedule(context, profile as LifestyleProfile);
  revalidatePath("/lifestyle");
  return { ok: true };
}

export async function saveLifestyleExercise(input: unknown) {
  const values = exerciseLogSchema.parse(input);
  const { context, profile } = await requireLifestyleProfile();
  const completedAt = values.completed ? new Date().toISOString() : null;
  const { data: exercise, error } = await context.supabase
    .from("website-lifestyle-session-exercises")
    .update({
      completed: values.completed,
      completed_sets: values.completed ? values.completedSets : Math.min(values.completedSets, 7),
      weight_kg: values.weightKg,
      reps_completed: values.repsCompleted,
      completed_at: completedAt,
    })
    .eq("id", values.exerciseId)
    .eq("profile_id", profile.id)
    .select("session_id")
    .single();
  if (error || !exercise) throw new Error("That exercise could not be updated.");
  const { count, error: countError } = await context.supabase
    .from("website-lifestyle-session-exercises")
    .select("id", { count: "exact", head: true })
    .eq("session_id", exercise.session_id)
    .eq("profile_id", profile.id)
    .eq("completed", false);
  if (countError) throw new Error("Workout progress could not be checked.");
  await context.supabase
    .from("website-lifestyle-workout-sessions")
    .update(count === 0
      ? { status: "completed", completed_at: new Date().toISOString() }
      : { status: "scheduled", completed_at: null })
    .eq("id", exercise.session_id)
    .eq("profile_id", profile.id);
  revalidatePath("/lifestyle");
  return { ok: true, sessionCompleted: count === 0 };
}

export async function completeLifestyleSession(sessionId: string) {
  const id = z.uuid().parse(sessionId);
  const { context, profile } = await requireLifestyleProfile();
  const completedAt = new Date().toISOString();
  const { error: exerciseError } = await context.supabase
    .from("website-lifestyle-session-exercises")
    .update({ completed: true, completed_at: completedAt })
    .eq("session_id", id)
    .eq("profile_id", profile.id);
  const { error: sessionError } = await context.supabase
    .from("website-lifestyle-workout-sessions")
    .update({ status: "completed", completed_at: completedAt })
    .eq("id", id)
    .eq("profile_id", profile.id);
  if (exerciseError || sessionError) throw new Error("That workout could not be completed.");
  revalidatePath("/lifestyle");
  return { ok: true };
}

export async function skipLifestyleSession(sessionId: string) {
  const id = z.uuid().parse(sessionId);
  const { context, profile } = await requireLifestyleProfile();
  const { error } = await context.supabase
    .from("website-lifestyle-workout-sessions")
    .update({ status: "skipped", completed_at: null })
    .eq("id", id)
    .eq("profile_id", profile.id);
  if (error) throw new Error("That workout could not be skipped.");
  revalidatePath("/lifestyle");
  return { ok: true };
}

export async function saveLifestyleCheckin(input: unknown) {
  const values = z.object({
    date: z.iso.date(),
    weightKg: z.number().min(30).max(300).nullable(),
    energy: z.number().int().min(1).max(5).nullable(),
    sleepHours: z.number().min(0).max(24).nullable(),
    note: z.string().trim().max(1000).nullable(),
  }).parse(input);
  const { context, profile } = await requireLifestyleProfile();
  const { error } = await context.supabase.from("website-lifestyle-checkins").upsert({
    workspace_id: context.membership.workspace_id,
    user_id: context.claims.sub,
    profile_id: profile.id,
    checkin_date: values.date,
    weight_kg: values.weightKg,
    energy: values.energy,
    sleep_hours: values.sleepHours,
    note: values.note || null,
  }, { onConflict: "profile_id,checkin_date" });
  if (error) throw new Error("Your check-in could not be saved.");
  revalidatePath("/lifestyle");
  return { ok: true };
}

export async function saveLifestylePushSubscription(input: unknown) {
  const { context, profile } = await requireLifestyleProfile();
  const subscription = subscriptionSchema.parse(input);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 500) ?? null;
  const { error } = await context.supabase.from("website-lifestyle-push-subscriptions").upsert({
    workspace_id: context.membership.workspace_id,
    user_id: context.claims.sub,
    profile_id: profile.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth_key: subscription.keys.auth,
    expiration_time: subscription.expirationTime,
    user_agent: userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "profile_id,endpoint" });
  if (error) throw new Error("This device could not be registered for Lifestyle reminders.");
  revalidatePath("/lifestyle");
  return { ok: true };
}

export async function removeLifestylePushSubscription(endpoint: string) {
  const { context, profile } = await requireLifestyleProfile();
  const parsed = z.url().startsWith("https://").max(2048).parse(endpoint);
  const { error } = await context.supabase
    .from("website-lifestyle-push-subscriptions")
    .delete()
    .eq("profile_id", profile.id)
    .eq("endpoint", parsed);
  if (error) throw new Error("Lifestyle reminders could not be disabled.");
  revalidatePath("/lifestyle");
  return { ok: true };
}

export async function getLifestylePushSubscriptionState(endpoint: string) {
  const { context, profile } = await requireLifestyleProfile();
  const parsed = z.url().startsWith("https://").max(2048).parse(endpoint);
  const { count, error } = await context.supabase
    .from("website-lifestyle-push-subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("endpoint", parsed);
  if (error) throw new Error("Lifestyle reminder status could not be checked.");
  return { enabled: Boolean(count) };
}

export async function sendLifestyleTestNotification(endpoint: string) {
  const { context, profile } = await requireLifestyleProfile();
  const parsed = z.url().startsWith("https://").max(2048).parse(endpoint);
  const { data, error } = await context.supabase
    .from("website-lifestyle-push-subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .eq("profile_id", profile.id)
    .eq("endpoint", parsed);
  if (error || !data?.length) throw new Error("Enable reminders on this device first.");
  const result = await sendPushNotifications(data as StoredPushSubscription[], {
    title: "Lifestyle is awake",
    body: "Hey pookie — this is your extremely official gym reminder test.",
    url: "/lifestyle?view=today",
    tag: `lifestyle-test-${Date.now()}`,
    kind: "lifestyle",
    badgeCount: 1,
  });
  if (!result.configured || !result.delivered) throw new Error("The test reminder could not reach this device.");
  return { ok: true };
}

