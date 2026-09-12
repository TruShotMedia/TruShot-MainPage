import "server-only";

import {
  buildCalendarReminderPushMessage,
  formatBrisbaneDate,
  getDueCalendarReminders,
  type CalendarReminderEvent,
  type CalendarReminderSettings,
  type DueCalendarReminder,
} from "@/lib/calendar-reminder-logic";
import { sendPushNotifications, type StoredPushSubscription } from "@/lib/push-notifications";
import { createServiceClient } from "@/lib/supabase/service";

type JobReminderRow = {
  id: string;
  title: string;
  client_id: string | null;
  status_id: string;
  shoot_date: string | null;
  shoot_time: string | null;
  due_date: string | null;
  due_time: string | null;
};

type TaskReminderRow = {
  id: string;
  title: string;
  job_id: string;
  status_id: string;
  due_date: string | null;
  due_time: string | null;
};

type CampaignReminderRow = {
  id: string;
  campaign_id: string;
  status_id: string;
  title: string;
  start_date: string | null;
  start_time: string | null;
  due_date: string | null;
  due_time: string | null;
};

export type CalendarReminderDispatchResult = {
  workspaces: number;
  candidates: number;
  delivered: number;
  failed: number;
  skippedDuplicates: number;
};

function dateBounds(now: Date, leadMinutes: number) {
  const day = 86_400_000;
  const futureDays = Math.ceil(leadMinutes / 1_440) + 2;
  return {
    start: formatBrisbaneDate(new Date(now.getTime() - day)),
    end: formatBrisbaneDate(new Date(now.getTime() + futureDays * day)),
  };
}

function addEvent(
  events: CalendarReminderEvent[],
  base: Omit<CalendarReminderEvent, "date" | "time" | "kind">,
  kind: CalendarReminderEvent["kind"],
  date: string | null,
  time: string | null,
) {
  if (date) events.push({ ...base, kind, date, time });
}

async function reserveDelivery(
  reminder: DueCalendarReminder,
  supabase: NonNullable<ReturnType<typeof createServiceClient>>,
) {
  const reservation = await supabase
    .from("website-calendar-reminder-deliveries")
    .insert({
      workspace_id: reminder.workspaceId,
      event_kind: reminder.kind,
      entity_id: reminder.entityId,
      occurrence_at: reminder.occurrenceAt.toISOString(),
      reminder_offset_minutes: reminder.offsetMinutes,
      status: "processing",
      attempted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (!reservation.error) return { id: reservation.data.id, duplicate: false };
  if (reservation.error.code !== "23505") throw reservation.error;

  const { data: previous, error: readError } = await supabase
    .from("website-calendar-reminder-deliveries")
    .select("id,status")
    .eq("workspace_id", reminder.workspaceId)
    .eq("event_kind", reminder.kind)
    .eq("entity_id", reminder.entityId)
    .eq("occurrence_at", reminder.occurrenceAt.toISOString())
    .eq("reminder_offset_minutes", reminder.offsetMinutes)
    .single();
  if (readError || !previous) throw readError ?? new Error("A reminder delivery could not be read.");
  if (previous.status !== "failed") return { id: previous.id, duplicate: true };

  const { data: retry, error: retryError } = await supabase
    .from("website-calendar-reminder-deliveries")
    .update({ status: "processing", attempted_at: new Date().toISOString(), error_message: null })
    .eq("id", previous.id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (retryError) throw retryError;
  return retry ? { id: retry.id, duplicate: false } : { id: previous.id, duplicate: true };
}

async function processWorkspace(
  settings: CalendarReminderSettings,
  now: Date,
  supabase: NonNullable<ReturnType<typeof createServiceClient>>,
) {
  const bounds = dateBounds(now, settings.lead_minutes);
  const [jobsResult, tasksResult, campaignAssetsResult, clientsResult, jobContextsResult, campaignsResult, jobStatusesResult, taskStatusesResult] = await Promise.all([
    supabase
      .from("website-jobs")
      .select("id,title,client_id,status_id,shoot_date,shoot_time,due_date,due_time")
      .eq("workspace_id", settings.workspace_id)
      .is("archived_at", null)
      .or(`and(shoot_date.gte.${bounds.start},shoot_date.lte.${bounds.end}),and(due_date.gte.${bounds.start},due_date.lte.${bounds.end})`),
    supabase
      .from("website-job-tasks")
      .select("id,title,job_id,status_id,due_date,due_time")
      .eq("workspace_id", settings.workspace_id)
      .is("archived_at", null)
      .gte("due_date", bounds.start)
      .lte("due_date", bounds.end),
    supabase
      .from("website-campaign-assets")
      .select("id,campaign_id,status_id,title,start_date,start_time,due_date,due_time")
      .eq("workspace_id", settings.workspace_id)
      .is("archived_at", null)
      .or(`and(start_date.gte.${bounds.start},start_date.lte.${bounds.end}),and(due_date.gte.${bounds.start},due_date.lte.${bounds.end})`),
    supabase.from("website-clients").select("id,name").eq("workspace_id", settings.workspace_id),
    supabase.from("website-jobs").select("id,title,client_id").eq("workspace_id", settings.workspace_id).is("archived_at", null),
    supabase.from("website-campaigns").select("id,title,client_id").eq("workspace_id", settings.workspace_id).is("archived_at", null),
    supabase.from("website-job-statuses").select("id,is_closed").eq("workspace_id", settings.workspace_id),
    supabase.from("website-task-statuses").select("id,is_open").eq("workspace_id", settings.workspace_id),
  ]);
  const queryError = [jobsResult, tasksResult, campaignAssetsResult, clientsResult, jobContextsResult, campaignsResult, jobStatusesResult, taskStatusesResult]
    .find((result) => result.error)?.error;
  if (queryError) throw queryError;

  const clients = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]));
  const jobContexts = new Map((jobContextsResult.data ?? []).map((job) => [job.id, job]));
  const campaigns = new Map((campaignsResult.data ?? []).map((campaign) => [campaign.id, campaign]));
  const jobStatuses = new Map((jobStatusesResult.data ?? []).map((status) => [status.id, status.is_closed]));
  const taskStatuses = new Map((taskStatusesResult.data ?? []).map((status) => [status.id, status.is_open]));
  const jobs = (jobsResult.data ?? []) as JobReminderRow[];
  const events: CalendarReminderEvent[] = [];

  for (const job of jobs) {
    if (jobStatuses.get(job.status_id) ?? false) continue;
    const base = {
      workspaceId: settings.workspace_id,
      entityId: job.id,
      title: job.title,
      context: job.client_id ? clients.get(job.client_id) ?? null : null,
    };
    if (settings.notify_job_starts) addEvent(events, base, "job_start", job.shoot_date, job.shoot_time);
    if (settings.notify_job_deadlines) addEvent(events, base, "job_due", job.due_date, job.due_time);
  }

  if (settings.notify_task_deadlines) {
    for (const task of (tasksResult.data ?? []) as TaskReminderRow[]) {
      if (!(taskStatuses.get(task.status_id) ?? true)) continue;
      const job = jobContexts.get(task.job_id);
      const context = [job?.title, job?.client_id ? clients.get(job.client_id) : null].filter(Boolean).join(" · ") || "Task deadline";
      addEvent(events, {
        workspaceId: settings.workspace_id,
        entityId: task.id,
        title: task.title,
        context,
      }, "task_due", task.due_date, task.due_time);
    }
  }

  if (settings.notify_campaign_assets) {
    for (const asset of (campaignAssetsResult.data ?? []) as CampaignReminderRow[]) {
      if (!(taskStatuses.get(asset.status_id) ?? true)) continue;
      const campaign = campaigns.get(asset.campaign_id);
      const context = [campaign?.title, campaign?.client_id ? clients.get(campaign.client_id) : null].filter(Boolean).join(" · ") || "Campaign deliverable";
      const base = {
        workspaceId: settings.workspace_id,
        entityId: asset.id,
        title: asset.title,
        context,
      };
      addEvent(events, base, "campaign_start", asset.start_date, asset.start_time);
      addEvent(events, base, "campaign_due", asset.due_date, asset.due_time);
    }
  }

  const reminders = getDueCalendarReminders({ events, settings, now });
  if (!reminders.length) return { candidates: 0, delivered: 0, failed: 0, skippedDuplicates: 0 };

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from("website-push-subscriptions")
    .select("id,endpoint,p256dh,auth_key")
    .eq("workspace_id", settings.workspace_id);
  if (subscriptionError) throw subscriptionError;
  const subscriptions = (subscriptionRows ?? []) as StoredPushSubscription[];
  if (!subscriptions.length) return { candidates: reminders.length, delivered: 0, failed: 0, skippedDuplicates: 0 };

  let delivered = 0;
  let failed = 0;
  let skippedDuplicates = 0;
  const expiredIds = new Set<string>();

  for (const reminder of reminders) {
    const reservation = await reserveDelivery(reminder, supabase);
    if (reservation.duplicate) {
      skippedDuplicates += 1;
      continue;
    }

    const result = await sendPushNotifications(subscriptions, buildCalendarReminderPushMessage(reminder));
    result.expiredIds.forEach((id) => expiredIds.add(id));
    delivered += result.delivered;
    failed += result.failed + (result.configured ? 0 : subscriptions.length);
    const deliveryStatus = result.configured && result.delivered > 0 ? "sent" : "failed";
    const { error: updateError } = await supabase
      .from("website-calendar-reminder-deliveries")
      .update({
        status: deliveryStatus,
        delivered_count: result.delivered,
        failed_count: result.configured ? result.failed : subscriptions.length,
        error_message: result.configured ? null : "Web Push server credentials are not configured.",
      })
      .eq("id", reservation.id);
    if (updateError) throw updateError;
  }

  if (expiredIds.size) {
    const { error } = await supabase.from("website-push-subscriptions").delete().in("id", [...expiredIds]);
    if (error) console.error("Expired calendar reminder subscriptions could not be removed.", error);
  }

  return { candidates: reminders.length, delivered, failed, skippedDuplicates };
}

export async function dispatchCalendarReminders(now = new Date()): Promise<CalendarReminderDispatchResult> {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("The Supabase server key is not configured.");
  const { data, error } = await supabase
    .from("website-calendar-reminder-settings")
    .select("workspace_id,enabled,default_event_time,lead_minutes,send_at_event_time,notify_job_starts,notify_job_deadlines,notify_task_deadlines,notify_campaign_assets,timezone")
    .eq("enabled", true);
  if (error) throw error;
  const settingsRows = (data ?? []) as CalendarReminderSettings[];
  const summaries = await Promise.all(settingsRows.map((settings) => processWorkspace(settings, now, supabase)));
  return summaries.reduce<CalendarReminderDispatchResult>((summary, result) => ({
    workspaces: summary.workspaces + 1,
    candidates: summary.candidates + result.candidates,
    delivered: summary.delivered + result.delivered,
    failed: summary.failed + result.failed,
    skippedDuplicates: summary.skippedDuplicates + result.skippedDuplicates,
  }), { workspaces: 0, candidates: 0, delivered: 0, failed: 0, skippedDuplicates: 0 });
}
