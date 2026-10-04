import "server-only";

import { ACTIVE_CLIENT_REQUEST_STATUSES } from "@/lib/client-requests";
import {
  BRISBANE_TIMEZONE,
  brisbaneOccurrence,
  buildCalendarReminderPushMessage,
  formatBrisbaneDate,
  getDueCalendarReminders,
  type CalendarReminderEvent,
  type CalendarReminderSettings,
} from "@/lib/calendar-reminder-logic";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";

type JobRow = {
  id: string;
  title: string;
  client_id: string | null;
  status_id: string;
  shoot_date: string | null;
  shoot_time: string | null;
  due_date: string | null;
  due_time: string | null;
};

type CalendarEventRow = {
  id: string;
  title: string;
  location: string | null;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  is_all_day: boolean;
  reminder_offsets_minutes: number[];
};

type JobMetricRow = {
  id: string;
  title: string;
  shoot_date: string | null;
  due_date: string | null;
  open_tasks: number | string;
};

type TaskRow = {
  id: string;
  title: string;
  job_id: string;
  status_id: string;
  due_time: string | null;
};

type CampaignAssetRow = {
  id: string;
  campaign_id: string;
  status_id: string;
  title: string;
  start_date: string | null;
  start_time: string | null;
  due_date: string | null;
  due_time: string | null;
};

export type DeviceHubAgendaItem = {
  id: string;
  kind: "event" | "job";
  title: string;
  context: string | null;
  occursAt: string;
  allDay: boolean;
};

export type DeviceHubNotification = {
  id: string;
  title: string;
  body: string;
  occursAt: string;
};

export type DeviceHubSnapshot = {
  counts: {
    inbox: number;
    jobsOutstanding: number;
    tasksOutstanding: number;
  };
  agenda: DeviceHubAgendaItem[];
  notifications: DeviceHubNotification[];
  updatedAt: string;
  timezone: typeof BRISBANE_TIMEZONE;
};

const DEFAULT_REMINDER_SETTINGS: CalendarReminderSettings = {
  workspace_id: TRUSHOT_WORKSPACE_ID,
  enabled: true,
  default_event_time: "09:00:00",
  lead_minutes: 60,
  send_at_event_time: true,
  notify_job_starts: true,
  notify_job_deadlines: true,
  notify_task_deadlines: true,
  notify_campaign_assets: true,
  timezone: BRISBANE_TIMEZONE,
};

function dayOffset(now: Date, days: number) {
  return formatBrisbaneDate(new Date(now.getTime() + days * 86_400_000));
}

function addReminderEvent(
  events: CalendarReminderEvent[],
  base: Omit<CalendarReminderEvent, "date" | "time" | "kind">,
  kind: CalendarReminderEvent["kind"],
  date: string | null,
  time: string | null,
) {
  if (date) events.push({ ...base, kind, date, time });
}

function agendaTimestamp(date: string | null, time: string | null, defaultTime: string) {
  if (!date) return null;
  return brisbaneOccurrence(date, time ?? defaultTime)?.toISOString() ?? null;
}

export async function getDeviceHubSnapshot(now = new Date()): Promise<DeviceHubSnapshot> {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("The Supabase server key is not configured.");

  const startDate = dayOffset(now, -1);
  const endDate = dayOffset(now, 14);
  const [
    inboxResult,
    metricsResult,
    openStatusesResult,
    jobsResult,
    eventsResult,
    clientsResult,
    jobStatusesResult,
    tasksResult,
    campaignAssetsResult,
    campaignsResult,
    settingsResult,
  ] = await Promise.all([
    supabase
      .from("website-enquiries")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .in("status", [...ACTIVE_CLIENT_REQUEST_STATUSES])
      .is("archived_at", null),
    supabase
      .from("website-job-metrics")
      .select("id,title,shoot_date,due_date,open_tasks", { count: "exact" })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .gt("open_tasks", 0),
    supabase
      .from("website-task-statuses")
      .select("id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("is_active", true)
      .eq("is_open", true),
    supabase
      .from("website-jobs")
      .select("id,title,client_id,status_id,shoot_date,shoot_time,due_date,due_time")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    supabase
      .from("website-calendar-events")
      .select("id,title,location,start_date,start_time,end_date,end_time,is_all_day,reminder_offsets_minutes")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .gte("start_date", startDate)
      .lte("start_date", endDate),
    supabase.from("website-clients").select("id,name").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    supabase.from("website-job-statuses").select("id,is_closed").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    supabase
      .from("website-job-tasks")
      .select("id,title,job_id,status_id,due_time")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    supabase
      .from("website-campaign-assets")
      .select("id,campaign_id,status_id,title,start_date,start_time,due_date,due_time")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .or(`and(start_date.gte.${startDate},start_date.lte.${endDate}),and(due_date.gte.${startDate},due_date.lte.${endDate})`),
    supabase
      .from("website-campaigns")
      .select("id,title,client_id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    supabase
      .from("website-calendar-reminder-settings")
      .select("workspace_id,enabled,default_event_time,lead_minutes,send_at_event_time,notify_job_starts,notify_job_deadlines,notify_task_deadlines,notify_campaign_assets,timezone")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .maybeSingle(),
  ]);

  const firstError = [inboxResult, metricsResult, openStatusesResult, jobsResult, eventsResult, clientsResult, jobStatusesResult, tasksResult, campaignAssetsResult, campaignsResult, settingsResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const openStatusIds = (openStatusesResult.data ?? []).map((status) => status.id);
  let tasksOutstanding = 0;
  if (openStatusIds.length) {
    const tasksResult = await supabase
      .from("website-job-tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .in("status_id", openStatusIds)
      .is("archived_at", null);
    if (tasksResult.error) throw tasksResult.error;
    tasksOutstanding = tasksResult.count ?? 0;
  }

  const settings = (settingsResult.data ?? DEFAULT_REMINDER_SETTINGS) as CalendarReminderSettings;
  const clients = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]));
  const closedJobStatuses = new Map((jobStatusesResult.data ?? []).map((status) => [status.id, Boolean(status.is_closed)]));
  const jobs = (jobsResult.data ?? []) as JobRow[];
  const calendarEvents = (eventsResult.data ?? []) as CalendarEventRow[];
  const tasks = (tasksResult.data ?? []) as TaskRow[];
  const campaignAssets = (campaignAssetsResult.data ?? []) as CampaignAssetRow[];
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const campaignsById = new Map((campaignsResult.data ?? []).map((campaign) => [campaign.id, campaign]));
  const openTaskStatuses = new Set(openStatusIds);
  const reminderEvents: CalendarReminderEvent[] = [];

  for (const job of jobs) {
    if (closedJobStatuses.get(job.status_id) ?? false) continue;
    const base = {
      workspaceId: TRUSHOT_WORKSPACE_ID,
      entityId: job.id,
      title: job.title,
      context: job.client_id ? clients.get(job.client_id) ?? null : null,
    };
    if (settings.notify_job_starts) addReminderEvent(reminderEvents, base, "job_start", job.shoot_date, job.shoot_time);
    if (settings.notify_job_deadlines) addReminderEvent(reminderEvents, base, "job_due", job.due_date, job.due_time);
  }

  if (settings.notify_task_deadlines) {
    for (const task of tasks) {
      if (!openTaskStatuses.has(task.status_id)) continue;
      const job = jobsById.get(task.job_id);
      if (!job || (closedJobStatuses.get(job.status_id) ?? false)) continue;
      addReminderEvent(reminderEvents, {
        workspaceId: TRUSHOT_WORKSPACE_ID,
        entityId: task.id,
        title: task.title,
        context: [job.title, job.client_id ? clients.get(job.client_id) : null].filter(Boolean).join(" · ") || "Task deadline",
      }, "task_due", job.due_date, task.due_time);
    }
  }

  if (settings.notify_campaign_assets) {
    for (const asset of campaignAssets) {
      if (!openTaskStatuses.has(asset.status_id)) continue;
      const campaign = campaignsById.get(asset.campaign_id);
      const context = [campaign?.title, campaign?.client_id ? clients.get(campaign.client_id) : null].filter(Boolean).join(" · ") || "Campaign deliverable";
      const base = {
        workspaceId: TRUSHOT_WORKSPACE_ID,
        entityId: asset.id,
        title: asset.title,
        context,
      };
      addReminderEvent(reminderEvents, base, "campaign_start", asset.start_date, asset.start_time);
      addReminderEvent(reminderEvents, base, "campaign_due", asset.due_date, asset.due_time);
    }
  }

  for (const event of calendarEvents) {
    if (!event.reminder_offsets_minutes?.length) continue;
    addReminderEvent(reminderEvents, {
      workspaceId: TRUSHOT_WORKSPACE_ID,
      entityId: event.id,
      title: event.title,
      context: event.location,
      reminderOffsetsMinutes: event.reminder_offsets_minutes,
    }, "calendar_event_start", event.start_date, event.start_time);
  }

  const notifications = settings.enabled
    ? getDueCalendarReminders({ events: reminderEvents, settings, now, lookbackMinutes: 2, lookaheadMinutes: 1 }).map((reminder) => {
      const message = buildCalendarReminderPushMessage(reminder);
      return {
        id: message.tag,
        title: message.title,
        body: message.body,
        occursAt: reminder.occurrenceAt.toISOString(),
      };
    })
    : [];

  const agenda: DeviceHubAgendaItem[] = [];
  for (const event of calendarEvents) {
    const occursAt = agendaTimestamp(event.start_date, event.start_time, settings.default_event_time);
    if (occursAt && new Date(occursAt).getTime() >= now.getTime() - 3_600_000) {
      agenda.push({ id: event.id, kind: "event", title: event.title, context: event.location, occursAt, allDay: event.is_all_day });
    }
  }
  for (const metric of (metricsResult.data ?? []) as JobMetricRow[]) {
    const date = metric.due_date ?? metric.shoot_date;
    const occursAt = agendaTimestamp(date, null, settings.default_event_time);
    if (occursAt && new Date(occursAt).getTime() >= now.getTime() - 3_600_000) {
      const openTasks = Number(metric.open_tasks) || 0;
      agenda.push({
        id: metric.id,
        kind: "job",
        title: metric.title,
        context: `${openTasks} open ${openTasks === 1 ? "task" : "tasks"}`,
        occursAt,
        allDay: true,
      });
    }
  }
  for (const task of tasks) {
    if (!openTaskStatuses.has(task.status_id)) continue;
    const job = jobsById.get(task.job_id);
    const occursAt = agendaTimestamp(job?.due_date ?? null, task.due_time, settings.default_event_time);
    if (occursAt && new Date(occursAt).getTime() >= now.getTime() - 3_600_000) {
      agenda.push({
        id: task.id,
        kind: "job",
        title: task.title,
        context: job?.title ?? "Task deadline",
        occursAt,
        allDay: !task.due_time,
      });
    }
  }

  agenda.sort((left, right) => left.occursAt.localeCompare(right.occursAt));
  return {
    counts: {
      inbox: inboxResult.count ?? 0,
      jobsOutstanding: metricsResult.count ?? 0,
      tasksOutstanding,
    },
    agenda: agenda.slice(0, 8),
    notifications,
    updatedAt: now.toISOString(),
    timezone: BRISBANE_TIMEZONE,
  };
}
