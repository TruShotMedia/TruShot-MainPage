import { cache } from "react";
import { addDays, eachDayOfInterval, format, parseISO, startOfDay } from "date-fns";
import { cookies } from "next/headers";
import {
  findLifestyleWorkout,
  getLifestyleExercise,
  getLifestyleProgram,
  getLifestyleWorkout,
  LIFESTYLE_LOGIN_EMAIL,
  type LifestyleProgramStyle,
} from "@/lib/lifestyle";
import { buildLifestyleSchedule, type LifestyleBusyWindow } from "@/lib/lifestyle-schedule";
import { createClient } from "@/lib/supabase/server";

export const LIFESTYLE_PROFILE_COOKIE = "lifestyle-profile";
export const LIFESTYLE_PROFILE_KEYS = ["john", "izzy"] as const;
export type LifestyleProfileKey = (typeof LIFESTYLE_PROFILE_KEYS)[number];

const PROFILE_DEFAULTS: Record<LifestyleProfileKey, { displayName: string; heightCm: number | null; weightKg: number | null }> = {
  john: { displayName: "John", heightCm: 180, weightKg: 70 },
  izzy: { displayName: "Izzy", heightCm: null, weightKg: null },
};

const PROFILE_FIELDS = "id,workspace_id,user_id,profile_key,display_name,program_style,days_per_week,session_duration_minutes,preferred_start_time,preferred_days,reminder_offsets_minutes,daily_gym_reminder_enabled,hydration_reminders_enabled,height_cm,weight_kg,training_goal,experience_level,focus_areas,safety_acknowledged_at";

export type LifestyleProfile = {
  id: string;
  workspace_id: string;
  user_id: string;
  profile_key: LifestyleProfileKey;
  display_name: string;
  program_style: LifestyleProgramStyle;
  days_per_week: number;
  session_duration_minutes: number;
  preferred_start_time: string;
  preferred_days: number[];
  reminder_offsets_minutes: number[];
  daily_gym_reminder_enabled: boolean;
  hydration_reminders_enabled: boolean;
  height_cm: number | null;
  weight_kg: number | null;
  training_goal: string;
  experience_level: string;
  focus_areas: string[];
  safety_acknowledged_at: string | null;
};

export function isLifestyleProfileKey(value: unknown): value is LifestyleProfileKey {
  return typeof value === "string" && LIFESTYLE_PROFILE_KEYS.includes(value as LifestyleProfileKey);
}

export type LifestyleExercise = {
  id: string;
  session_id: string;
  exercise_key: string;
  name: string;
  movement_pattern: "squat" | "hinge" | "bridge" | "push" | "pull" | "carry" | "core" | "single_leg";
  position: number;
  target_sets: number;
  rep_min: number;
  rep_max: number;
  rest_seconds: number;
  form_cues: string[];
  completed: boolean;
  completed_sets: number;
  weight_kg: number | null;
  reps_completed: number | null;
  notes: string | null;
  completed_at: string | null;
};

export type LifestyleSession = {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  workout_key: string;
  title: string;
  focus: string;
  sequence_index: number;
  status: "scheduled" | "completed" | "skipped";
  source: "auto" | "manual";
  scheduling_note: string | null;
  completed_at: string | null;
  exercises: LifestyleExercise[];
};

export type LifestyleCheckin = {
  id: string;
  checkin_date: string;
  weight_kg: number | null;
  energy: number | null;
  sleep_hours: number | null;
  note: string | null;
};

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function expandDates(startDate: string, endDate: string) {
  return eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) }).map((date) => format(date, "yyyy-MM-dd"));
}

export const getLifestyleContext = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : "";
  if (!userId || email !== LIFESTYLE_LOGIN_EMAIL) return null;
  const { data: membership } = await supabase
    .from("website-admin-users")
    .select("id,workspace_id,display_name,role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!membership) return null;
  return { supabase, claims, membership };
});

async function loadBusyWindows(
  context: NonNullable<Awaited<ReturnType<typeof getLifestyleContext>>>,
  rangeStart: string,
  rangeEnd: string,
) {
  const [eventsResult, flightsResult, jobsResult, tasksResult] = await Promise.all([
    context.supabase
      .from("website-calendar-events")
      .select("title,start_date,start_time,end_date,end_time,is_all_day")
      .eq("workspace_id", context.membership.workspace_id)
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart),
    context.supabase
      .from("website-flight-events")
      .select("title,departure_date,departure_time,arrival_date,arrival_time")
      .eq("workspace_id", context.membership.workspace_id)
      .lte("departure_date", rangeEnd)
      .gte("arrival_date", rangeStart),
    context.supabase
      .from("website-jobs")
      .select("title,shoot_date,shoot_time,due_date,due_time")
      .eq("workspace_id", context.membership.workspace_id)
      .is("archived_at", null)
      .or(`shoot_date.gte.${rangeStart},due_date.gte.${rangeStart}`)
      .or(`shoot_date.lte.${rangeEnd},due_date.lte.${rangeEnd}`),
    context.supabase
      .from("website-job-tasks")
      .select("title,due_date,due_time")
      .eq("workspace_id", context.membership.workspace_id)
      .is("archived_at", null)
      .is("completed_at", null)
      .gte("due_date", rangeStart)
      .lte("due_date", rangeEnd),
  ]);
  const error = eventsResult.error ?? flightsResult.error ?? jobsResult.error ?? tasksResult.error;
  if (error) throw new Error(`Lifestyle scheduling conflicts could not be checked: ${error.message}`);

  const windows: LifestyleBusyWindow[] = [];
  (eventsResult.data ?? []).forEach((event) => {
    expandDates(event.start_date, event.end_date).forEach((date) => {
      windows.push({
        date,
        startTime: date === event.start_date ? event.start_time : null,
        endTime: date === event.end_date ? event.end_time : null,
        allDay: event.is_all_day || event.start_date !== event.end_date,
        label: event.title,
      });
    });
  });
  (flightsResult.data ?? []).forEach((flight) => {
    expandDates(flight.departure_date, flight.arrival_date).forEach((date) => {
      windows.push({
        date,
        startTime: date === flight.departure_date ? flight.departure_time : "00:00",
        endTime: date === flight.arrival_date ? flight.arrival_time : "23:59",
        allDay: false,
        label: flight.title,
      });
    });
  });
  (jobsResult.data ?? []).forEach((job) => {
    if (job.shoot_date) windows.push({ date: job.shoot_date, startTime: job.shoot_time, endTime: null, allDay: false, label: job.title });
    if (job.due_date && job.due_time) windows.push({ date: job.due_date, startTime: job.due_time, endTime: null, allDay: false, label: `${job.title} due` });
  });
  (tasksResult.data ?? []).forEach((task) => {
    if (task.due_date && task.due_time) windows.push({ date: task.due_date, startTime: task.due_time, endTime: null, allDay: false, label: task.title });
  });
  return windows;
}

export async function ensureLifestyleProfile(
  context: NonNullable<Awaited<ReturnType<typeof getLifestyleContext>>>,
  profileKey: LifestyleProfileKey,
) {
  const { data: existing, error: readError } = await context.supabase
    .from("website-lifestyle-profiles")
    .select(PROFILE_FIELDS)
    .eq("user_id", context.claims.sub)
    .eq("profile_key", profileKey)
    .maybeSingle();
  if (readError) throw new Error(`Lifestyle settings could not be loaded: ${readError.message}`);
  if (existing) return existing as LifestyleProfile;

  const defaults = PROFILE_DEFAULTS[profileKey];
  const { data: created, error } = await context.supabase
    .from("website-lifestyle-profiles")
    .insert({
      workspace_id: context.membership.workspace_id,
      user_id: context.claims.sub,
      profile_key: profileKey,
      display_name: defaults.displayName,
      height_cm: defaults.heightCm,
      weight_kg: defaults.weightKg,
    })
    .select(PROFILE_FIELDS)
    .single();
  if (error || !created) throw new Error(`Lifestyle settings could not be created: ${error?.message ?? "Unknown error"}`);
  return created as LifestyleProfile;
}

export async function ensureLifestyleProfiles(context: NonNullable<Awaited<ReturnType<typeof getLifestyleContext>>>) {
  const profiles = await Promise.all(LIFESTYLE_PROFILE_KEYS.map((profileKey) => ensureLifestyleProfile(context, profileKey)));
  return profiles.sort((left, right) => LIFESTYLE_PROFILE_KEYS.indexOf(left.profile_key) - LIFESTYLE_PROFILE_KEYS.indexOf(right.profile_key));
}

async function selectedLifestyleProfileKey() {
  const cookieStore = await cookies();
  const value = cookieStore.get(LIFESTYLE_PROFILE_COOKIE)?.value;
  return isLifestyleProfileKey(value) ? value : null;
}

export async function getActiveLifestyleProfile(context: NonNullable<Awaited<ReturnType<typeof getLifestyleContext>>>) {
  const profileKey = await selectedLifestyleProfileKey();
  return profileKey ? ensureLifestyleProfile(context, profileKey) : null;
}

export async function ensureLifestyleSchedule(
  context: NonNullable<Awaited<ReturnType<typeof getLifestyleContext>>>,
  profile: LifestyleProfile,
) {
  const startDate = localDate();
  const rangeEnd = localDate(addDays(startOfDay(new Date()), 69));
  const [{ data: existing, error: existingError }, busyWindows] = await Promise.all([
    context.supabase
      .from("website-lifestyle-workout-sessions")
      .select("id,session_date")
      .eq("profile_id", profile.id)
      .gte("session_date", startDate)
      .lte("session_date", rangeEnd),
    loadBusyWindows(context, startDate, rangeEnd),
  ]);
  if (existingError) throw new Error(`Lifestyle plan could not be checked: ${existingError.message}`);

  const existingDates = new Set((existing ?? []).map((session) => session.session_date));
  const planned = buildLifestyleSchedule({
    startDate,
    weeks: 10,
    daysPerWeek: profile.days_per_week,
    preferredDays: profile.preferred_days,
    preferredStartTime: profile.preferred_start_time,
    durationMinutes: profile.session_duration_minutes,
    busyWindows,
    program: getLifestyleProgram(profile.days_per_week, profile.program_style),
  }).filter((session) => !existingDates.has(session.sessionDate));

  if (planned.length) {
    const { error } = await context.supabase.from("website-lifestyle-workout-sessions").insert(planned.map((session) => ({
      workspace_id: context.membership.workspace_id,
      user_id: context.claims.sub,
      profile_id: profile.id,
      session_date: session.sessionDate,
      start_time: session.startTime,
      end_time: session.endTime,
      workout_key: session.workout.key,
      title: session.workout.title,
      focus: session.workout.focus,
      sequence_index: session.sequenceIndex,
      scheduling_note: session.schedulingNote,
    })));
    if (error) throw new Error(`Lifestyle sessions could not be scheduled: ${error.message}`);
  }

  const { data: sessions, error: sessionsError } = await context.supabase
    .from("website-lifestyle-workout-sessions")
    .select("id,workout_key")
    .eq("profile_id", profile.id)
    .gte("session_date", startDate)
    .lte("session_date", rangeEnd);
  if (sessionsError) throw new Error(`Lifestyle sessions could not be reloaded: ${sessionsError.message}`);
  if (!sessions?.length) return;

  const { data: existingExercises, error: exerciseReadError } = await context.supabase
    .from("website-lifestyle-session-exercises")
    .select("session_id")
    .in("session_id", sessions.map((session) => session.id));
  if (exerciseReadError) throw new Error(`Lifestyle exercises could not be checked: ${exerciseReadError.message}`);
  const populatedSessionIds = new Set((existingExercises ?? []).map((exercise) => exercise.session_id));
  const exerciseRows = sessions.flatMap((session) => {
    if (populatedSessionIds.has(session.id)) return [];
    return getLifestyleWorkout(session.workout_key).exercises.map((exercise, position) => ({
      workspace_id: context.membership.workspace_id,
      user_id: context.claims.sub,
      profile_id: profile.id,
      session_id: session.id,
      exercise_key: exercise.key,
      name: exercise.name,
      movement_pattern: exercise.pattern,
      position,
      target_sets: exercise.sets,
      rep_min: exercise.repMin,
      rep_max: exercise.repMax,
      rest_seconds: exercise.restSeconds,
      form_cues: exercise.cues,
    }));
  });
  if (exerciseRows.length) {
    const { error } = await context.supabase.from("website-lifestyle-session-exercises").insert(exerciseRows);
    if (error) throw new Error(`Lifestyle exercises could not be prepared: ${error.message}`);
  }
}

export async function getLifestyleData() {
  const context = await getLifestyleContext();
  if (!context) return null;
  const [profiles, selectedProfileKey] = await Promise.all([ensureLifestyleProfiles(context), selectedLifestyleProfileKey()]);
  const profile = selectedProfileKey ? profiles.find((item) => item.profile_key === selectedProfileKey) ?? null : null;
  if (!profile) {
    return { today: localDate(), profiles, profile: null, sessions: [], checkins: [], subscriptionCount: 0 };
  }
  await ensureLifestyleSchedule(context, profile);
  const today = localDate();
  const historyStart = localDate(addDays(new Date(), -84));
  const futureEnd = localDate(addDays(new Date(), 70));
  const [sessionsResult, checkinsResult, subscriptionsResult] = await Promise.all([
    context.supabase
      .from("website-lifestyle-workout-sessions")
      .select("id,session_date,start_time,end_time,workout_key,title,focus,sequence_index,status,source,scheduling_note,completed_at")
      .eq("profile_id", profile.id)
      .gte("session_date", historyStart)
      .lte("session_date", futureEnd)
      .order("session_date"),
    context.supabase
      .from("website-lifestyle-checkins")
      .select("id,checkin_date,weight_kg,energy,sleep_hours,note")
      .eq("profile_id", profile.id)
      .order("checkin_date", { ascending: false })
      .limit(24),
    context.supabase
      .from("website-lifestyle-push-subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id),
  ]);
  const error = sessionsResult.error ?? checkinsResult.error ?? subscriptionsResult.error;
  if (error) throw new Error(`Lifestyle could not be loaded: ${error.message}`);
  const sessionRows = (sessionsResult.data ?? []) as Omit<LifestyleSession, "exercises">[];
  const { data: exerciseRows, error: exerciseError } = sessionRows.length
    ? await context.supabase
      .from("website-lifestyle-session-exercises")
      .select("id,session_id,exercise_key,name,movement_pattern,position,target_sets,rep_min,rep_max,rest_seconds,form_cues,completed,completed_sets,weight_kg,reps_completed,notes,completed_at")
      .in("session_id", sessionRows.map((session) => session.id))
      .order("position")
    : { data: [], error: null };
  if (exerciseError) throw new Error(`Lifestyle exercises could not be loaded: ${exerciseError.message}`);
  const exercisesBySession = new Map<string, LifestyleExercise[]>();
  ((exerciseRows ?? []) as LifestyleExercise[]).forEach((exercise) => {
    const currentDefinition = getLifestyleExercise(exercise.exercise_key);
    const hydratedExercise = currentDefinition
      ? { ...exercise, name: currentDefinition.name, form_cues: currentDefinition.cues }
      : exercise;
    const exercises = exercisesBySession.get(exercise.session_id) ?? [];
    exercises.push(hydratedExercise);
    exercisesBySession.set(exercise.session_id, exercises);
  });
  return {
    today,
    profiles,
    profile,
    sessions: sessionRows.map((session) => {
      const currentWorkout = findLifestyleWorkout(session.workout_key);
      return {
        ...session,
        title: currentWorkout?.title ?? session.title,
        focus: currentWorkout?.focus ?? session.focus,
        exercises: exercisesBySession.get(session.id) ?? [],
      };
    }),
    checkins: (checkinsResult.data ?? []) as LifestyleCheckin[],
    subscriptionCount: subscriptionsResult.count ?? 0,
  };
}

