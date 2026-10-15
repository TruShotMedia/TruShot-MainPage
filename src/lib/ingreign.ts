export const INGREIGN_PORTAL_KEY = "ingreign";
export const INGREIGN_NOTIFICATION_TIME = "09:00";

export const INGREIGN_PRESET_KEYS = [
  "date_post",
  "one_week",
  "three_days",
  "two_days",
  "one_day",
  "event_day",
] as const;

export type IngreignPresetKey = (typeof INGREIGN_PRESET_KEYS)[number];
export type IngreignGeneratorMode = "date_only" | "countdown_3" | "countdown_2" | "countdown_1";

export type IngreignCaptionPreset = {
  id: string;
  preset_key: IngreignPresetKey;
  label: string;
  caption: string;
  generator_mode: IngreignGeneratorMode;
  position: number;
  is_active: boolean;
};

export type IngreignManualEvent = {
  id: string;
  title: string;
  calendar_label: string;
  event_date: string;
  preset_key: IngreignPresetKey | null;
  generator_mode: IngreignGeneratorMode;
  month_label: string | null;
  day_label: string | null;
  caption_override: string | null;
  notification_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type IngreignCalendarMarker = {
  id: string;
  date: string;
  eventDate: string;
  title: string;
  calendarLabel: string;
  presetKey: IngreignPresetKey;
  generatorMode: IngreignGeneratorMode;
  monthLabel: string;
  dayLabel: string;
  captionOverride: string | null;
  notificationEnabled: boolean;
  isManual: boolean;
};

const recurringMarkers: Array<{
  offsetDays: number;
  presetKey: IngreignPresetKey;
  calendarLabel: string;
  generatorMode: IngreignGeneratorMode;
}> = [
  { offsetDays: -14, presetKey: "date_post", calendarLabel: "2 weeks · Date post", generatorMode: "date_only" },
  { offsetDays: -7, presetKey: "one_week", calendarLabel: "1 week out", generatorMode: "date_only" },
  { offsetDays: -3, presetKey: "three_days", calendarLabel: "3 days", generatorMode: "countdown_3" },
  { offsetDays: -2, presetKey: "two_days", calendarLabel: "2 days", generatorMode: "countdown_2" },
  { offsetDays: -1, presetKey: "one_day", calendarLabel: "1 day", generatorMode: "countdown_1" },
  { offsetDays: 0, presetKey: "event_day", calendarLabel: "INGREIGN EVENT", generatorMode: "date_only" },
];

function dateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addCalendarDays(value: string, days: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

export function firstFriday(year: number, monthIndex: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const daysUntilFriday = (5 - first.getUTCDay() + 7) % 7;
  first.setUTCDate(1 + daysUntilFriday);
  return dateKey(first);
}

export function formatIngreignDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(dateFromKey(value));
}

export function markerDateParts(value: string) {
  const date = dateFromKey(value);
  return {
    monthLabel: new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: "UTC" }).format(date),
    dayLabel: String(date.getUTCDate()).padStart(2, "0"),
  };
}

export function buildRecurringIngreignMarkers(year: number): IngreignCalendarMarker[] {
  const markers: IngreignCalendarMarker[] = [];
  for (let monthIndex = 2; monthIndex <= 11; monthIndex += 1) {
    const eventDate = firstFriday(year, monthIndex);
    const eventParts = markerDateParts(eventDate);
    for (const marker of recurringMarkers) {
      const date = addCalendarDays(eventDate, marker.offsetDays);
      markers.push({
        id: `recurring-${eventDate}-${marker.presetKey}`,
        date,
        eventDate,
        title: marker.offsetDays === 0 ? "INGREIGN EVENT" : marker.calendarLabel,
        calendarLabel: marker.calendarLabel,
        presetKey: marker.presetKey,
        generatorMode: marker.generatorMode,
        monthLabel: eventParts.monthLabel,
        dayLabel: eventParts.dayLabel,
        captionOverride: null,
        notificationEnabled: true,
        isManual: false,
      });
    }
  }
  return markers.sort((left, right) => left.date.localeCompare(right.date));
}

export function manualEventToMarker(event: IngreignManualEvent): IngreignCalendarMarker {
  const parts = markerDateParts(event.event_date);
  return {
    id: `manual-${event.id}`,
    date: event.event_date,
    eventDate: event.event_date,
    title: event.title,
    calendarLabel: event.calendar_label,
    presetKey: event.preset_key ?? "date_post",
    generatorMode: event.generator_mode,
    monthLabel: event.month_label || parts.monthLabel,
    dayLabel: event.day_label || parts.dayLabel,
    captionOverride: event.caption_override,
    notificationEnabled: event.notification_enabled,
    isManual: true,
  };
}

export function replaceIngreignCaptionTokens(caption: string, marker: Pick<IngreignCalendarMarker, "date" | "eventDate" | "monthLabel" | "dayLabel">) {
  const eventParts = markerDateParts(marker.eventDate);
  return caption
    .replaceAll("{{MONTH}}", marker.monthLabel)
    .replaceAll("{{DAY}}", marker.dayLabel)
    .replaceAll("{{EVENT_MONTH}}", eventParts.monthLabel)
    .replaceAll("{{EVENT_DAY}}", eventParts.dayLabel);
}

export function getCountdownValue(mode: IngreignGeneratorMode) {
  if (mode === "countdown_3") return "03";
  if (mode === "countdown_2") return "02";
  if (mode === "countdown_1") return "01";
  return null;
}

