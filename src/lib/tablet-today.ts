import type {
  CalendarCampaignAsset,
  CalendarCustomEvent,
  CalendarFlightEvent,
  CalendarItem,
  CalendarJob,
  CalendarTask,
} from "@/lib/types";

export type TabletTodaySource = CalendarItem | CalendarCustomEvent | CalendarFlightEvent;
export type TabletTodayTone = "accent" | "muted" | "urgent";

export type TabletTodayEntry = {
  id: string;
  kind: "job" | "task" | "campaign" | "event" | "flight";
  title: string;
  context: string;
  meta: string | null;
  time: string | null;
  timeSort: string;
  tone: TabletTodayTone;
  source: TabletTodaySource;
  urgency: "scheduled" | "due" | "overdue" | "progress";
};

export type TabletTodayAgenda = {
  schedule: TabletTodayEntry[];
  priority: TabletTodayEntry[];
  inProgress: TabletTodayEntry[];
  counts: {
    scheduled: number;
    dueToday: number;
    overdue: number;
    inProgress: number;
  };
};

type TabletTodayInput = {
  today: string;
  jobs: CalendarJob[];
  tasks: CalendarTask[];
  campaignAssets?: CalendarCampaignAsset[];
  customEvents?: CalendarCustomEvent[];
  flightEvents?: CalendarFlightEvent[];
  accentClientName?: string;
  accentKeywords?: string[];
};

const dueDateFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "short",
});

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU");
}

function compactTime(value: string | null | undefined) {
  if (!value) return null;
  const [hourText, minuteText] = value.slice(0, 5).split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minuteText === "00" ? "" : `:${minuteText}`}${suffix}`;
}

function readableDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return dueDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

function isAccentItem(
  item: CalendarItem | CalendarCustomEvent | CalendarFlightEvent,
  accentClientName?: string,
  accentKeywords: string[] = [],
) {
  void accentKeywords;
  if (!accentClientName) return true;
  return normalize(item.client_name) === normalize(accentClientName);
}

function isInProgress(statusLabel: string) {
  const status = normalize(statusLabel);
  return status !== "not started" && status !== "posted / done" && status !== "delivered" && status !== "complete" && status !== "completed";
}

function sortByTime(left: TabletTodayEntry, right: TabletTodayEntry) {
  return left.timeSort.localeCompare(right.timeSort) || left.title.localeCompare(right.title);
}

function sortPriority(left: TabletTodayEntry, right: TabletTodayEntry) {
  if (left.urgency !== right.urgency) return left.urgency === "overdue" ? -1 : 1;
  return left.timeSort.localeCompare(right.timeSort) || left.title.localeCompare(right.title);
}

export function buildTabletTodayAgenda({
  today,
  jobs,
  tasks,
  campaignAssets = [],
  customEvents = [],
  flightEvents = [],
  accentClientName,
  accentKeywords = [],
}: TabletTodayInput): TabletTodayAgenda {
  const schedule: TabletTodayEntry[] = [];
  const priority: TabletTodayEntry[] = [];
  const inProgress: TabletTodayEntry[] = [];
  let dueToday = 0;
  let overdue = 0;

  for (const flight of flightEvents) {
    if (flight.departure_date > today || flight.arrival_date < today) continue;
    const isDeparture = flight.departure_date === today;
    const isArrival = flight.arrival_date === today;
    const time = isDeparture ? compactTime(flight.departure_time) : isArrival ? compactTime(flight.arrival_time) : null;
    const airline = isDeparture ? flight.departure_airline : flight.arrival_airline;
    const flightNumber = isDeparture ? flight.departure_flight_number : flight.arrival_flight_number;
    const context = `${flight.origin_location} → ${flight.destination_location}${airline ? ` · ${airline}` : ""}${flightNumber ? ` ${flightNumber}` : ""}`;
    const detail = [
      isDeparture
        ? `Depart ${flight.origin_location}${flight.departure_terminal ? ` · Terminal ${flight.departure_terminal}` : ""}`
        : isArrival
          ? `Arrive ${flight.destination_location}${flight.arrival_terminal ? ` · Terminal ${flight.arrival_terminal}` : ""}`
          : "In transit",
      flight.travel_class,
      flight.seat_number ? `Seat ${flight.seat_number}` : null,
    ].filter(Boolean).join(" · ");
    schedule.push({
      id: `flight:${flight.id}`,
      kind: "flight",
      title: flight.title,
      context,
      meta: detail,
      time,
      timeSort: isDeparture ? flight.departure_time : isArrival ? flight.arrival_time : "12:00",
      tone: isAccentItem(flight, accentClientName, accentKeywords) ? "accent" : "muted",
      source: flight,
      urgency: "scheduled",
    });
  }

  for (const event of customEvents) {
    if (event.start_date > today || event.end_date < today) continue;
    const isStarting = event.start_date === today;
    const isEnding = event.end_date === today;
    const time = event.is_all_day ? null : compactTime(isStarting ? event.start_time : isEnding ? event.end_time : null);
    const meta = event.is_all_day
      ? "All day"
      : isStarting
        ? `${time ? `Starts ${time}` : "Starts today"}${event.end_date !== today ? ` · through ${event.end_date}` : ""}`
        : isEnding
          ? `${time ? `Ends ${time}` : "Ends today"}`
          : "Continues today";
    schedule.push({
      id: `event:${event.id}`,
      kind: "event",
      title: event.title,
      context: event.location ?? "Calendar event",
      meta,
      time,
      timeSort: event.is_all_day ? "00:00" : isStarting ? event.start_time ?? "00:00" : isEnding ? event.end_time ?? "23:59" : "00:00",
      tone: isAccentItem(event, accentClientName, accentKeywords) ? "accent" : "muted",
      source: event,
      urgency: "scheduled",
    });
  }

  for (const job of jobs) {
    if (job.is_complete) continue;
    const isShootToday = job.shoot_date === today;
    const isDueToday = job.due_date === today;
    const isOverdue = Boolean(job.due_date && job.due_date < today);
    const tone: TabletTodayTone = isAccentItem(job, accentClientName, accentKeywords) ? "accent" : "muted";
    if (isDueToday) dueToday += 1;
    if (isOverdue) overdue += 1;

    const base = {
      id: `job:${job.id}`,
      kind: "job" as const,
      title: job.title,
      context: job.client_name ?? "No client",
      tone,
      source: job,
    };
    if (isShootToday) {
      schedule.push({
        ...base,
        meta: isOverdue ? "Shoot today · overdue" : isDueToday ? "Shoot and delivery today" : "Production today",
        time: compactTime(job.shoot_time),
        timeSort: job.shoot_time ?? "00:00",
        urgency: "scheduled",
      });
    } else if (isDueToday || isOverdue) {
      priority.push({
        ...base,
        meta: job.status_label,
        time: compactTime(job.due_time),
        timeSort: job.due_time ?? "23:59",
        tone: isOverdue ? "urgent" : tone,
        urgency: isOverdue ? "overdue" : "due",
      });
    } else if (isInProgress(job.status_label)) {
      inProgress.push({
        ...base,
        meta: job.due_date ? `Due ${readableDate(job.due_date)}` : "No deadline set",
        time: null,
        timeSort: job.due_date ?? "9999-12-31",
        urgency: "progress",
      });
    }
  }

  for (const task of tasks) {
    if (task.is_complete) continue;
    const isDueToday = task.due_date === today;
    const isOverdue = Boolean(task.due_date && task.due_date < today);
    const tone: TabletTodayTone = isAccentItem(task, accentClientName, accentKeywords) ? "accent" : "muted";
    if (isDueToday) dueToday += 1;
    if (isOverdue) overdue += 1;
    const base = {
      id: `task:${task.id}`,
      kind: "task" as const,
      title: task.title,
      context: task.job_title,
      tone,
      source: task,
    };
    if (isDueToday || isOverdue) {
      priority.push({
        ...base,
        meta: task.status_label,
        time: compactTime(task.due_time),
        timeSort: task.due_time ?? "23:59",
        tone: isOverdue ? "urgent" : tone,
        urgency: isOverdue ? "overdue" : "due",
      });
    } else if (isInProgress(task.status_label)) {
      inProgress.push({
        ...base,
        meta: task.due_date ? `Due ${readableDate(task.due_date)}` : task.status_label,
        time: null,
        timeSort: task.due_date ?? "9999-12-31",
        urgency: "progress",
      });
    }
  }

  for (const asset of campaignAssets) {
    if (asset.is_complete) continue;
    const startsToday = asset.start_date === today;
    const isDueToday = asset.due_date === today;
    const isOverdue = Boolean(asset.due_date && asset.due_date < today);
    const tone: TabletTodayTone = isAccentItem(asset, accentClientName, accentKeywords) ? "accent" : "muted";
    if (isDueToday) dueToday += 1;
    if (isOverdue) overdue += 1;
    const base = {
      id: `campaign:${asset.id}`,
      kind: "campaign" as const,
      title: asset.title,
      context: asset.campaign_title,
      tone,
      source: asset,
    };
    if (startsToday) {
      schedule.push({
        ...base,
        meta: isDueToday ? "Starts and is due today" : "Campaign work starts",
        time: compactTime(asset.start_time),
        timeSort: asset.start_time ?? "00:00",
        urgency: "scheduled",
      });
    } else if (isDueToday || isOverdue) {
      priority.push({
        ...base,
        meta: asset.status_label,
        time: compactTime(asset.due_time),
        timeSort: asset.due_time ?? "23:59",
        tone: isOverdue ? "urgent" : tone,
        urgency: isOverdue ? "overdue" : "due",
      });
    } else if (isInProgress(asset.status_label)) {
      inProgress.push({
        ...base,
        meta: asset.due_date ? `Due ${readableDate(asset.due_date)}` : asset.status_label,
        time: null,
        timeSort: asset.due_date ?? "9999-12-31",
        urgency: "progress",
      });
    }
  }

  schedule.sort(sortByTime);
  priority.sort(sortPriority);
  inProgress.sort(sortByTime);

  return {
    schedule,
    priority,
    inProgress,
    counts: { scheduled: schedule.length, dueToday, overdue, inProgress: inProgress.length },
  };
}
