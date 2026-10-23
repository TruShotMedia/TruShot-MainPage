export type ClickUpCalendarEventSnapshot = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  is_all_day: boolean;
};

const calendarEventMarker = /\[TRUSHOT_CALENDAR_EVENT_ID:([0-9a-f-]{36})\]/i;

const brisbaneDateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Brisbane",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function brisbaneTimestamp(date: string, time: string | null) {
  const normalisedTime = time?.slice(0, 5) || "00:00";
  const timestamp = Date.parse(`${date}T${normalisedTime}:00+10:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function clean(value: string | null) {
  return value?.trim() || null;
}

function brisbaneNowParts(now: Date) {
  const parts = Object.fromEntries(
    brisbaneDateTime.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function isClickUpCalendarEventComplete(event: ClickUpCalendarEventSnapshot, now = new Date()) {
  const current = brisbaneNowParts(now);
  if (event.end_date < current.date) return true;
  if (event.end_date > current.date || event.is_all_day) return false;
  return Boolean(event.end_time && event.end_time.slice(0, 5) <= current.time);
}

export function buildClickUpCalendarEventDescription(event: ClickUpCalendarEventSnapshot) {
  const timing = event.is_all_day
    ? `${event.start_date}${event.end_date !== event.start_date ? ` → ${event.end_date}` : ""} · All day`
    : `${event.start_date} ${event.start_time?.slice(0, 5) ?? ""} → ${event.end_date} ${event.end_time?.slice(0, 5) ?? ""}`;
  const details = [
    "**CRM type:** AutoPacific calendar event",
    `**When:** ${timing}`,
    clean(event.location) ? `**Location:** ${event.location?.trim()}` : null,
  ].filter(Boolean);
  return [
    details.join("  \n"),
    clean(event.description),
    `---\nSynced from John's CRM · Calendar event ID: \`${event.id}\`\n[TRUSHOT_CALENDAR_EVENT_ID:${event.id}]`,
  ].filter(Boolean).join("\n\n");
}

export function extractClickUpCalendarEventId(description: string | null | undefined) {
  return description?.match(calendarEventMarker)?.[1]?.toLowerCase() ?? null;
}

export function buildClickUpCalendarEventPayload({
  assignedUserId,
  completeStatus,
  event,
  now,
  openStatus,
}: {
  assignedUserId: number;
  completeStatus: string;
  event: ClickUpCalendarEventSnapshot;
  now?: Date;
  openStatus: string;
}) {
  return {
    name: event.title,
    markdown_content: buildClickUpCalendarEventDescription(event),
    status: isClickUpCalendarEventComplete(event, now) ? completeStatus : openStatus,
    archived: false,
    assignees: [assignedUserId],
    start_date: brisbaneTimestamp(event.start_date, event.start_time),
    start_date_time: !event.is_all_day && Boolean(event.start_time),
    due_date: brisbaneTimestamp(event.end_date, event.end_time),
    due_date_time: !event.is_all_day && Boolean(event.end_time),
  };
}

export function buildClickUpCalendarEventUpdatePayload(
  input: Parameters<typeof buildClickUpCalendarEventPayload>[0],
) {
  const payload = buildClickUpCalendarEventPayload(input);
  return {
    ...payload,
    assignees: { add: [input.assignedUserId], rem: [] },
  };
}
