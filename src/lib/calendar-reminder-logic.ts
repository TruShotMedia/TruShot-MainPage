import type { PushMessage } from "@/lib/push";

export const BRISBANE_TIMEZONE = "Australia/Brisbane";
const BRISBANE_OFFSET = "+10:00";

export type CalendarReminderEventKind = "job_start" | "job_due" | "task_due" | "campaign_start" | "campaign_due";

export type CalendarReminderSettings = {
  workspace_id: string;
  enabled: boolean;
  default_event_time: string;
  lead_minutes: number;
  send_at_event_time: boolean;
  notify_job_starts: boolean;
  notify_job_deadlines: boolean;
  notify_task_deadlines: boolean;
  notify_campaign_assets: boolean;
  timezone: typeof BRISBANE_TIMEZONE;
};

export type CalendarReminderEvent = {
  workspaceId: string;
  entityId: string;
  kind: CalendarReminderEventKind;
  title: string;
  date: string;
  time: string | null;
  context: string | null;
};

export type DueCalendarReminder = CalendarReminderEvent & {
  occurrenceAt: Date;
  reminderAt: Date;
  offsetMinutes: number;
};

const reminderLabels: Record<CalendarReminderEventKind, { subject: string; atTime: string }> = {
  job_start: { subject: "Production", atTime: "starting now" },
  job_due: { subject: "Job deadline", atTime: "due now" },
  task_due: { subject: "Task", atTime: "due now" },
  campaign_start: { subject: "Campaign asset", atTime: "starting now" },
  campaign_due: { subject: "Campaign asset", atTime: "due now" },
};

const brisbaneTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: BRISBANE_TIMEZONE,
});

const brisbaneDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: BRISBANE_TIMEZONE,
  year: "numeric",
});

export function formatBrisbaneDate(date: Date) {
  const parts = brisbaneDateFormatter.formatToParts(date);
  const value = new Map(parts.map((part) => [part.type, part.value]));
  return `${value.get("year")}-${value.get("month")}-${value.get("day")}`;
}

export function brisbaneOccurrence(date: string, time: string) {
  const normalizedTime = /^\d{2}:\d{2}(?::\d{2})?$/.test(time) ? time : "09:00:00";
  const timestamp = new Date(`${date}T${normalizedTime}${BRISBANE_OFFSET}`);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function getDueCalendarReminders({
  events,
  settings,
  now,
  lookbackMinutes = 20,
  lookaheadMinutes = 5,
}: {
  events: CalendarReminderEvent[];
  settings: CalendarReminderSettings;
  now: Date;
  lookbackMinutes?: number;
  lookaheadMinutes?: number;
}) {
  const due: DueCalendarReminder[] = [];
  const windowStart = now.getTime() - lookbackMinutes * 60_000;
  const windowEnd = now.getTime() + lookaheadMinutes * 60_000;
  const offsets = settings.send_at_event_time ? [settings.lead_minutes, 0] : [settings.lead_minutes];

  for (const event of events) {
    const occurrenceAt = brisbaneOccurrence(event.date, event.time ?? settings.default_event_time);
    if (!occurrenceAt) continue;
    for (const offsetMinutes of offsets) {
      const reminderAt = new Date(occurrenceAt.getTime() - offsetMinutes * 60_000);
      if (reminderAt.getTime() < windowStart || reminderAt.getTime() >= windowEnd) continue;
      due.push({ ...event, occurrenceAt, reminderAt, offsetMinutes });
    }
  }

  return due;
}

function leadLabel(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${hours.toFixed(1)} hours`;
}

export function buildCalendarReminderPushMessage(reminder: DueCalendarReminder): PushMessage {
  const labels = reminderLabels[reminder.kind];
  const eventTime = brisbaneTimeFormatter.format(reminder.occurrenceAt);
  const timing = reminder.offsetMinutes === 0 ? labels.atTime : `in ${leadLabel(reminder.offsetMinutes)}`;
  const context = reminder.context ? ` · ${reminder.context}` : "";
  return {
    title: `${labels.subject} ${timing}`,
    body: `${reminder.title}${context} · ${eventTime}`,
    url: `/admin/calendar?type=${encodeURIComponent(reminder.kind)}&item=${encodeURIComponent(reminder.entityId)}`,
    tag: `calendar-${reminder.kind}-${reminder.entityId}-${reminder.occurrenceAt.toISOString()}-${reminder.offsetMinutes}`,
  };
}
