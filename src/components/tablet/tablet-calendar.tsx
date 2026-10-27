"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { BriefcaseBusiness, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ListTodo, Megaphone, Plane, Plus, RotateCcw } from "lucide-react";
import { AirlineLogo } from "@/components/tablet/airline-logo";
import { CalendarWeatherBadge, CalendarWeatherCredit, CalendarWeatherDetails, useCalendarWeather, WeatherIcon } from "@/components/shared/calendar-weather";
import type { SavedCalendarWeather } from "@/lib/calendar-weather";
import { buildCalendarRangeWeeks, getCalendarScheduleRanges, type CalendarRangeSegment, type CalendarScheduleRangeItem } from "@/lib/calendar-layout";
import { buildFlightCalendarItineraries } from "@/lib/flight-itineraries";
import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarFlightEvent, CalendarItem, CalendarJob, CalendarTask } from "@/lib/types";

type TabletCalendarEvent = {
  id: string;
  date: string;
  kind: "job" | "task" | "campaign";
  label: string;
  title: string;
  detail: string;
  color: string;
  isComplete: boolean;
  isOverdue: boolean;
  isRescheduled: boolean;
  item: CalendarItem;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calendarWindowDays = 42;
const visibleRangeLanes = 3;
const capacityDesktopWindowDays = 14;
const capacityMobileWindowDays = 7;
type CalendarStandardRangeItem = Exclude<CalendarScheduleRangeItem, CalendarFlightEvent>;

type CalendarPalette = {
  accentClientName?: string;
  accentColor?: string;
  accentKeywords?: string[];
  completedColor?: string;
  mutedColor?: string;
  overdueColor?: string;
};

type CalendarDisplayItem = CalendarScheduleRangeItem | CalendarItem;

function normalizeMatchValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU");
}

function itemBelongsToAccentClient(item: CalendarDisplayItem, palette: CalendarPalette) {
  if (!palette.accentClientName) return true;
  return normalizeMatchValue(item.client_name ?? "") === normalizeMatchValue(palette.accentClientName);
}

function isCalendarItemComplete(item: CalendarDisplayItem, today: string, currentTime: string) {
  if (item.entity_type === "calendar-event") {
    if (item.end_date < today) return true;
    if (item.end_date > today || item.is_all_day) return false;
    return Boolean(item.end_time && item.end_time.slice(0, 5) <= currentTime);
  }
  if (item.entity_type === "flight-event") {
    if (item.arrival_date < today) return true;
    if (item.arrival_date > today) return false;
    return item.arrival_time.slice(0, 5) <= currentTime;
  }
  return item.is_complete;
}

function isOverdueAccentWork(item: CalendarDisplayItem, palette: CalendarPalette, today: string) {
  return Boolean(
    palette.overdueColor
    && (item.entity_type === "job" || item.entity_type === "task" || item.entity_type === "campaign-asset")
    && !item.is_complete
    && item.due_date
    && item.due_date < today
    && itemBelongsToAccentClient(item, palette),
  );
}

function delayState(item: CalendarDisplayItem) {
  if (!("delay_info" in item)) return { isDelayedSource: false, isRescheduled: false, reason: null as string | null };
  return {
    isDelayedSource: Boolean(item.delay_info?.delayed_to),
    isRescheduled: Boolean(item.delay_info?.delayed_from),
    reason: item.delay_info?.delayed_from?.reason ?? item.delay_info?.delayed_to?.reason ?? null,
  };
}

function calendarItemColor(item: CalendarDisplayItem, palette: CalendarPalette, today: string, currentTime: string) {
  const originalColor = item.entity_type === "calendar-event" || item.entity_type === "flight-event" ? item.color : item.status_color;
  const delay = delayState(item);
  if (delay.isDelayedSource) return "#C45A45";
  if (delay.isRescheduled) return "#B47448";
  if (palette.completedColor && isCalendarItemComplete(item, today, currentTime)) return palette.completedColor;
  if (isOverdueAccentWork(item, palette, today)) return palette.overdueColor!;
  if (!palette.accentColor) return originalColor;
  if (itemBelongsToAccentClient(item, palette)) return palette.accentColor;
  return palette.mutedColor ?? "#687177";
}

function getCalendarWindow(month: Date, today: Date, capacityWindowDays?: number) {
  if (capacityWindowDays) {
    const start = startOfWeek(month, { weekStartsOn: 1 });
    return {
      start,
      end: addDays(start, capacityWindowDays - 1),
      isRolling: true,
    };
  }

  const monthStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const standardEnd = addDays(monthStart, calendarWindowDays - 1);
  const daysUntilMonthEnd = differenceInCalendarDays(endOfMonth(month), today);
  const isNearCurrentMonthEnd = isSameMonth(month, today) && daysUntilMonthEnd >= 0 && daysUntilMonthEnd <= 14;

  if (!isNearCurrentMonthEnd) return { start: monthStart, end: standardEnd, isRolling: false };

  const rollingEnd = endOfWeek(addDays(today, 14), { weekStartsOn: 1 });
  if (differenceInCalendarDays(rollingEnd, standardEnd) <= 0) {
    return { start: monthStart, end: standardEnd, isRolling: true };
  }

  return {
    start: addDays(rollingEnd, -(calendarWindowDays - 1)),
    end: rollingEnd,
    isRolling: true,
  };
}

function dateWindowLabel(startDate: string, endDate: string) {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (format(start, "yyyy") !== format(end, "yyyy")) return `${format(start, "d MMM yyyy")}–${format(end, "d MMM yyyy")}`;
  if (format(start, "yyyy-MM") !== format(end, "yyyy-MM")) return `${format(start, "d MMM")}–${format(end, "d MMM")}`;
  return `${format(start, "d")}–${format(end, "d MMM")}`;
}

function compactTime(value: string) {
  const [hourText, minuteText] = value.slice(0, 5).split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minuteText === "00" ? "" : `:${minuteText}`}${suffix}`;
}

function mobileRangeTimeLabel(item: CalendarScheduleRangeItem) {
  if (item.entity_type === "calendar-event" && item.is_all_day) return "All day";
  const startDate = item.entity_type === "flight-event" ? item.departure_date : item.entity_type === "calendar-event" || item.entity_type === "campaign-asset" ? item.start_date : item.shoot_date;
  const endDate = item.entity_type === "flight-event" ? item.arrival_date : item.entity_type === "calendar-event" ? item.end_date : item.due_date;
  const startTime = item.entity_type === "flight-event" ? item.departure_time : item.entity_type === "calendar-event" || item.entity_type === "campaign-asset" ? item.start_time : item.shoot_time;
  const endTime = item.entity_type === "flight-event" ? item.arrival_time : item.entity_type === "calendar-event" ? item.end_time : item.due_time;
  const spansDays = Boolean(startDate && endDate && startDate !== endDate);
  const describeTime = (date: string | null, time: string) => `${spansDays && date ? `${format(parseISO(date), "d MMM")} · ` : ""}${compactTime(time)}`;
  if (item.entity_type === "calendar-event" && startTime && endTime) return `${describeTime(startDate, startTime)} – ${describeTime(endDate, endTime)}`;
  const startLabel = item.entity_type === "flight-event" ? "Departs" : item.entity_type === "job" ? "Shoot" : "Starts";
  const endLabel = item.entity_type === "flight-event" ? "Arrives" : item.entity_type === "calendar-event" ? "Ends" : "Due";
  return [startTime ? `${startLabel} ${describeTime(startDate, startTime)}` : null, endTime ? `${endLabel} ${describeTime(endDate, endTime)}` : null].filter(Boolean).join(" · ") || "Time not set";
}

function MobileBookingTime({ label }: { label: string }) {
  return <span className="tablet-calendar-mobile-entry-time"><Clock3 size={12} aria-hidden="true" /><span>{label}</span></span>;
}

function flightHoverDetails(flight: CalendarFlightEvent) {
  const legs = flight.itinerary_legs ?? [flight];
  return [
    flight.title,
    ...legs.flatMap((leg, index) => [
      `${legs.length > 1 ? `${index === 0 ? "Outbound" : "Return"}: ` : ""}${leg.departure_airline}${leg.departure_flight_number ? ` ${leg.departure_flight_number}` : ""} · ${leg.origin_location} · ${leg.departure_date} ${compactTime(leg.departure_time)}`,
      `Arrives ${leg.destination_location} · ${leg.arrival_date} ${compactTime(leg.arrival_time)}${leg.arrival_terminal ? ` · Terminal ${leg.arrival_terminal}` : ""}`,
      leg.travel_class ? `Class: ${leg.travel_class}${leg.seat_number ? ` · Seat ${leg.seat_number}` : ""}` : leg.seat_number ? `Seat ${leg.seat_number}` : null,
    ]),
    flight.accommodation_title ? `Accommodation: ${flight.accommodation_title}${flight.accommodation_location ? ` · ${flight.accommodation_location}` : ""}${flight.accommodation_notes ? ` · ${flight.accommodation_notes}` : ""}` : null,
    flight.vehicle_title ? `Vehicle: ${flight.vehicle_title}${flight.vehicle_location ? ` · ${flight.vehicle_location}` : ""}${flight.vehicle_notes ? ` · ${flight.vehicle_notes}` : ""}` : null,
    flight.notes,
  ].filter(Boolean).join("\n");
}

function dateFallsInRange(date: string, range: { end: string; start: string; weekdaysOnly: boolean }) {
  if (date < range.start || date > range.end) return false;
  if (!range.weekdaysOnly) return true;
  const weekday = parseISO(date).getDay();
  return weekday !== 0 && weekday !== 6;
}

function MobileRangeAgendaCard({ currentTime, editable, onOpen, palette, range, today }: { currentTime: string; editable: boolean; onOpen: (item: CalendarScheduleRangeItem) => void; palette: CalendarPalette; range: ReturnType<typeof getCalendarScheduleRanges>[number]; today: string }) {
  const item = range.item;
  const isFlight = item.entity_type === "flight-event";
  const isCalendarEvent = item.entity_type === "calendar-event";
  const isComplete = isCalendarItemComplete(item, today, currentTime);
  const isOverdue = !isFlight && !isCalendarEvent && isOverdueAccentWork(item, palette, today);
  const color = calendarItemColor(item, palette, today, currentTime);
  const kicker = isFlight
    ? "Flight itinerary"
    : isCalendarEvent
      ? "Calendar event"
      : isOverdue
        ? "Overdue job"
      : item.entity_type === "campaign-asset"
        ? "Campaign"
        : "Job window";
  const detail = isFlight
    ? `${item.origin_location} → ${item.destination_location}`
    : isCalendarEvent
      ? ""
      : item.entity_type === "campaign-asset"
        ? item.campaign_title
        : item.client_name ?? "No client";
  const Icon = isFlight ? Plane : isCalendarEvent ? CalendarClock : item.entity_type === "campaign-asset" ? Megaphone : BriefcaseBusiness;

  return (
    <article
      className={`tablet-calendar-mobile-entry ${isFlight ? "is-flight" : ""} ${isOverdue ? "is-overdue" : ""} ${isComplete ? "is-complete" : ""} ${editable ? "is-editable" : ""}`}
      style={{ "--tablet-calendar-color": color } as CSSProperties}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? () => onOpen(item) : undefined}
      onKeyDown={editable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
        }
      } : undefined}
    >
      <span className="tablet-calendar-mobile-entry-icon"><Icon size={17} /></span>
      <span className="tablet-calendar-mobile-entry-copy"><small>{kicker}</small><strong>{item.title}</strong><MobileBookingTime label={mobileRangeTimeLabel(item)} />{detail ? <em>{detail}</em> : null}</span>
      <span className="tablet-calendar-mobile-entry-side">{isComplete ? <CheckCircle2 size={16} /> : editable ? <ChevronRight size={16} /> : null}</span>
    </article>
  );
}

function MobileDeadlineAgendaCard({ editable, event, onOpen }: { editable: boolean; event: TabletCalendarEvent; onOpen?: (item: CalendarItem) => void }) {
  const Icon = event.kind === "task" ? ListTodo : event.kind === "campaign" ? Megaphone : BriefcaseBusiness;
  const bookedTime = event.item.entity_type === "job" && event.id.endsWith("-shoot") ? event.item.shoot_time : event.item.due_time;
  return (
    <article
      className={`tablet-calendar-mobile-entry is-deadline ${event.isOverdue ? "is-overdue" : ""} ${event.isRescheduled ? "is-rescheduled" : ""} ${event.isComplete ? "is-complete" : ""} ${editable ? "is-editable" : ""}`}
      style={{ "--tablet-calendar-color": event.color } as CSSProperties}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? () => onOpen?.(event.item) : undefined}
      onKeyDown={editable ? (keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onOpen?.(event.item);
        }
      } : undefined}
    >
      <span className="tablet-calendar-mobile-entry-icon">{event.isRescheduled ? <RotateCcw size={17} /> : <Icon size={17} />}</span>
      <span className="tablet-calendar-mobile-entry-copy"><small>{event.isRescheduled ? "Rescheduled" : event.label}</small><strong>{event.title}</strong><MobileBookingTime label={bookedTime ? compactTime(bookedTime) : "Time not set"} /><em>{event.detail}</em></span>
      <span className="tablet-calendar-mobile-entry-side">{event.isComplete ? <CheckCircle2 size={16} /> : editable ? <ChevronRight size={16} /> : null}</span>
    </article>
  );
}

function FlightRange({ currentTime, editable, onOpen, palette, segment, today }: { currentTime: string; editable: boolean; onOpen: (item: CalendarScheduleRangeItem) => void; palette: CalendarPalette; segment: CalendarRangeSegment<CalendarFlightEvent>; today: string }) {
  const flight = segment.item;
  const showDeparture = !segment.startsBeforeWeek;
  const showArrival = !segment.endsAfterWeek;
  const isComplete = isCalendarItemComplete(flight, today, currentTime);
  const rangeColor = calendarItemColor(flight, palette, today, currentTime);
  return (
    <article
      aria-label={`${flight.title}, flight from ${flight.origin_location} to ${flight.destination_location}${isComplete ? ", completed" : ""}`}
      className={`tablet-calendar-job-range tablet-calendar-flight-range ${editable ? "is-editable" : ""} ${segment.startsBeforeWeek ? "continues-before" : ""} ${segment.endsAfterWeek ? "continues-after" : ""} ${isComplete ? "is-complete" : ""}`}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? () => onOpen(flight) : undefined}
      onKeyDown={editable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(flight);
        }
      } : undefined}
      title={flightHoverDetails(flight)}
      style={{
        "--tablet-calendar-color": rangeColor,
        gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
        gridRow: `${segment.lane + 1} / span ${segment.laneSpan}`,
      } as CSSProperties}
    >
      <div className={`flight-range-endpoint ${showDeparture ? "" : "is-hidden"}`}>
        <AirlineLogo code={flight.departure_airline_code} name={flight.departure_airline} />
        <span>{compactTime(flight.departure_time)}</span>
        <small>{flight.origin_location}</small>
      </div>
      <div className="flight-range-title">
        <Plane size={12} aria-hidden="true" />
        <strong>{flight.title}</strong>
        <em>{flight.origin_location} → {flight.destination_location}</em>
      </div>
      <div className={`flight-range-endpoint is-arrival ${showArrival ? "" : "is-hidden"}`}>
        <AirlineLogo code={flight.arrival_airline_code} name={flight.arrival_airline} />
        <span>{compactTime(flight.arrival_time)}</span>
        <small>{flight.destination_location}</small>
      </div>
    </article>
  );
}

function JobRange({ currentTime, editable, onOpen, palette, segment, today }: { currentTime: string; editable: boolean; onOpen: (item: CalendarScheduleRangeItem) => void; palette: CalendarPalette; segment: CalendarRangeSegment<CalendarStandardRangeItem>; today: string }) {
  const windowLabel = dateWindowLabel(segment.start, segment.end);
  const isCalendarEvent = segment.item.entity_type === "calendar-event";
  const isComplete = isCalendarItemComplete(segment.item, today, currentTime);
  const isOverdue = isOverdueAccentWork(segment.item, palette, today);
  const delay = delayState(segment.item);
  const rangeColor = calendarItemColor(segment.item, palette, today, currentTime);
  const context = segment.item.entity_type === "calendar-event"
    ? segment.item.location
    : segment.item.entity_type === "campaign-asset"
      ? segment.item.campaign_title
      : segment.item.client_name ?? "No client";
  const statusLabel = segment.item.entity_type === "calendar-event" ? "Calendar event" : segment.item.status_label;
  return (
    <article
      aria-label={`${segment.item.title}, scheduled ${windowLabel}, ${segment.durationDays} ${segment.durationDays === 1 ? "day" : "days"}${isOverdue ? ", overdue" : ""}${isComplete ? ", completed" : ""}`}
      className={`tablet-calendar-job-range ${editable ? "is-editable" : ""} ${isCalendarEvent ? "is-calendar-event" : ""} ${isOverdue ? "is-overdue" : ""} ${delay.isDelayedSource ? "is-delayed-source" : ""} ${delay.isRescheduled ? "is-rescheduled" : ""} ${segment.startsBeforeWeek ? "continues-before" : ""} ${segment.endsAfterWeek ? "continues-after" : ""} ${isComplete ? "is-complete" : ""}`}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? () => onOpen(segment.item) : undefined}
      onKeyDown={editable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(segment.item);
        }
      } : undefined}
      title={`${segment.item.title} · ${windowLabel}${context ? ` · ${context}` : ""} · ${statusLabel}${delay.reason ? ` · Delayed: ${delay.reason}` : ""}`}
      style={{
        "--tablet-calendar-color": rangeColor,
        gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
        gridRow: `${segment.lane + 1} / span ${segment.laneSpan}`,
      } as CSSProperties}
    >
      <strong>{delay.isRescheduled ? <RotateCcw size={10} aria-label="Rescheduled" /> : null}{segment.item.title}</strong>
      {!isCalendarEvent ? <em>{context}</em> : null}
      {!isCalendarEvent ? <span>{segment.endsAfterWeek ? "Continues" : `Due ${format(parseISO(segment.end), "d MMM")}`}</span> : null}
    </article>
  );
}

export function TabletCalendar({ accentColor, accentClientName, accentKeywords, completedColor, currentTime = "00:00", mutedColor, overdueColor, jobs, tasks, campaignAssets = [], customEvents = [], flightEvents = [], density = "standard", editable = false, onCreateEvent, onEditEvent, onEditFlight, onEditItem, today }: CalendarPalette & { jobs: CalendarJob[]; tasks: CalendarTask[]; campaignAssets?: CalendarCampaignAsset[]; customEvents?: CalendarCustomEvent[]; currentTime?: string; flightEvents?: CalendarFlightEvent[]; density?: "standard" | "capacity"; editable?: boolean; onCreateEvent?: (date: string) => void; onEditEvent?: (event: CalendarCustomEvent) => void; onEditFlight?: (event: CalendarFlightEvent) => void; onEditItem?: (item: CalendarItem) => void; today: string }) {
  const todayDate = useMemo(() => parseISO(today), [today]);
  const [currentMonth, setCurrentMonth] = useState(() => density === "capacity" ? todayDate : startOfMonth(todayDate));
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [selectedMobileDate, setSelectedMobileDate] = useState(today);
  const isCapacityCalendar = density === "capacity";
  const capacityWindowDays = isCapacityCalendar
    ? isCompactViewport ? capacityMobileWindowDays : capacityDesktopWindowDays
    : undefined;
  const palette = useMemo(() => ({ accentClientName, accentColor, accentKeywords, completedColor, mutedColor, overdueColor }), [accentClientName, accentColor, accentKeywords, completedColor, mutedColor, overdueColor]);
  const calendarFlights = useMemo(() => buildFlightCalendarItineraries(flightEvents), [flightEvents]);
  const scheduleRanges = useMemo(() => getCalendarScheduleRanges([...jobs, ...campaignAssets, ...customEvents, ...calendarFlights]), [calendarFlights, campaignAssets, customEvents, jobs]);
  const rangedItemKeys = useMemo(() => new Set(scheduleRanges.map((range) => `${range.item.entity_type}:${range.item.id}`)), [scheduleRanges]);
  const calendarWindow = useMemo(() => getCalendarWindow(currentMonth, todayDate, capacityWindowDays), [capacityWindowDays, currentMonth, todayDate]);
  const calendarDays = useMemo(() => eachDayOfInterval(calendarWindow), [calendarWindow]);
  const calendarWeeks = useMemo(() => buildCalendarRangeWeeks(calendarDays.map((day) => format(day, "yyyy-MM-dd")), scheduleRanges), [calendarDays, scheduleRanges]);
  const firstCalendarDay = format(calendarWindow.start, "yyyy-MM-dd");
  const lastCalendarDay = format(calendarWindow.end, "yyyy-MM-dd");
  const weather = useCalendarWeather(firstCalendarDay, lastCalendarDay);
  const weatherByDay = useMemo(() => new Map(weather.days.map((day) => [day.date, day])), [weather.days]);
  const [selectedWeather, setSelectedWeather] = useState<SavedCalendarWeather | null>(null);
  const activeMobileDate = selectedMobileDate < firstCalendarDay || selectedMobileDate > lastCalendarDay
    ? firstCalendarDay
    : selectedMobileDate;
  const events = useMemo(() => {
    const jobEvents = jobs.flatMap((job): TabletCalendarEvent[] => {
      if (rangedItemKeys.has(`job:${job.id}`)) return [];
      const eventsForJob: TabletCalendarEvent[] = [];
      if (job.shoot_date) eventsForJob.push({
        id: `${job.id}-shoot`,
        date: job.shoot_date,
        kind: "job",
        label: "Production",
        title: job.title,
        detail: job.client_name ?? "No client",
        color: calendarItemColor(job, palette, today, currentTime),
        isComplete: job.is_complete,
        isOverdue: isOverdueAccentWork(job, palette, today),
        isRescheduled: delayState(job).isRescheduled,
        item: job,
      });
      if (job.due_date && job.due_date !== job.shoot_date) eventsForJob.push({
        id: `${job.id}-due`,
        date: job.due_date,
        kind: "job",
        label: "Job due",
        title: job.title,
        detail: job.client_name ?? "No client",
        color: calendarItemColor(job, palette, today, currentTime),
        isComplete: job.is_complete,
        isOverdue: isOverdueAccentWork(job, palette, today),
        isRescheduled: delayState(job).isRescheduled,
        item: job,
      });
      return eventsForJob;
    });
    const taskEvents = tasks.flatMap((task): TabletCalendarEvent[] => task.due_date ? [{
      id: `${task.id}-due`,
      date: task.due_date,
      kind: "task",
      label: "Asset due",
      title: task.title,
      detail: task.job_title,
      color: calendarItemColor(task, palette, today, currentTime),
      isComplete: task.is_complete,
      isOverdue: isOverdueAccentWork(task, palette, today),
      isRescheduled: delayState(task).isRescheduled,
      item: task,
    }] : []);
    const campaignEvents = campaignAssets.flatMap((asset): TabletCalendarEvent[] => {
      if (!asset.due_date || rangedItemKeys.has(`campaign-asset:${asset.id}`)) return [];
      return [{
        id: `${asset.id}-campaign-due`,
        date: asset.due_date,
        kind: "campaign",
        label: "Campaign asset",
        title: asset.title,
        detail: asset.campaign_title,
        color: calendarItemColor(asset, palette, today, currentTime),
        isComplete: asset.is_complete,
        isOverdue: isOverdueAccentWork(asset, palette, today),
        isRescheduled: false,
        item: asset,
      }];
    });
    return [...jobEvents, ...taskEvents, ...campaignEvents];
  }, [campaignAssets, currentTime, jobs, palette, rangedItemKeys, tasks, today]);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, TabletCalendarEvent[]>();
    for (const event of events) grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    return grouped;
  }, [events]);
  const selectedMobileRanges = useMemo(
    () => scheduleRanges.filter((range) => dateFallsInRange(activeMobileDate, range)),
    [activeMobileDate, scheduleRanges],
  );
  const selectedMobileEvents = eventsByDay.get(activeMobileDate) ?? [];
  const mobileDayCounts = useMemo(() => new Map(calendarDays.map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const rangeCount = scheduleRanges.filter((range) => dateFallsInRange(dateKey, range)).length;
    return [dateKey, rangeCount + (eventsByDay.get(dateKey)?.length ?? 0)];
  })), [calendarDays, eventsByDay, scheduleRanges]);

  useEffect(() => {
    if (!isCapacityCalendar || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsCompactViewport(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, [isCapacityCalendar]);

  function moveCalendar(direction: -1 | 1) {
    if (isCapacityCalendar) {
      const days = capacityWindowDays ?? capacityDesktopWindowDays;
      setCurrentMonth((month) => addDays(month, direction * days));
      if (isCompactViewport) setSelectedMobileDate((date) => format(addDays(parseISO(date), direction * days), "yyyy-MM-dd"));
      return;
    }
    setCurrentMonth((month) => direction < 0 ? subMonths(month, 1) : addMonths(month, 1));
  }

  function jumpToToday() {
    setCurrentMonth(isCapacityCalendar ? todayDate : startOfMonth(todayDate));
    setSelectedMobileDate(today);
  }

  function openRangeItem(item: CalendarScheduleRangeItem) {
    if (!editable) return;
    if (item.entity_type === "calendar-event") onEditEvent?.(item);
    else if (item.entity_type === "flight-event") onEditFlight?.(item);
    else onEditItem?.(item);
  }

  return (
    <section className={`tablet-calendar ${isCapacityCalendar ? "is-capacity" : ""} ${isCompactViewport ? "is-compact-window" : ""} ${completedColor ? "has-completed-color" : ""} ${editable ? "is-editable" : "is-read-only"}`} aria-label="Production calendar">
      <header className="tablet-calendar-toolbar">
        <div className="tablet-calendar-month-controls">
          <button type="button" onClick={() => moveCalendar(-1)} aria-label={isCapacityCalendar ? "Previous calendar period" : "Previous month"}><ChevronLeft size={16} /></button>
          <div>
            <span>{isCapacityCalendar ? `${capacityWindowDays === capacityMobileWindowDays ? "One-week" : "Two-week"} focus` : calendarWindow.isRolling ? `Rolling · through ${format(calendarWindow.end, "d MMM")}` : "Six-week schedule"}</span>
            <h1>{isCapacityCalendar ? dateWindowLabel(format(calendarWindow.start, "yyyy-MM-dd"), format(calendarWindow.end, "yyyy-MM-dd")) : format(currentMonth, "MMMM yyyy")}</h1>
          </div>
          <button type="button" onClick={() => moveCalendar(1)} aria-label={isCapacityCalendar ? "Next calendar period" : "Next month"}><ChevronRight size={16} /></button>
          <button type="button" className="tablet-calendar-today" onClick={jumpToToday}>Today</button>
        </div>
        <div className="tablet-calendar-legend" aria-label="Calendar legend">
          <span><i className="is-job" /> Job window</span>
          <span><i className="is-task" /> Deadline</span>
          <span><i className="is-campaign" /> Campaign</span>
          <span><i className="is-calendar-event" /> Event</span>
          <span><i className="is-flight" /> Flight</span>
          {overdueColor ? <span><i className="is-overdue" style={{ background: overdueColor }} /> Overdue</span> : null}
          <span><i className="is-complete" style={completedColor ? { background: completedColor } : undefined} /> Completed</span>
        </div>
      </header>

      {isCompactViewport && isCapacityCalendar ? (
        <div className="tablet-calendar-mobile" data-testid="tablet-calendar-mobile">
          <div className="tablet-calendar-mobile-week" role="tablist" aria-label="Choose a day">
            {calendarDays.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const count = mobileDayCounts.get(dateKey) ?? 0;
              return (
                <button type="button" role="tab" aria-selected={activeMobileDate === dateKey} className={`${activeMobileDate === dateKey ? "is-selected" : ""} ${dateKey === today ? "is-today" : ""}`} onClick={() => setSelectedMobileDate(dateKey)} key={dateKey}>
                  <span>{format(day, "EEE")}</span><strong>{format(day, "d")}</strong>{weatherByDay.has(dateKey) ? <span className={`calendar-week-weather weather-${weatherByDay.get(dateKey)!.condition}`}><WeatherIcon condition={weatherByDay.get(dateKey)!.condition} size={14} /></span> : null}{count ? <i aria-label={`${count} scheduled items`}>{count}</i> : <i aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <section className="tablet-calendar-mobile-agenda" aria-label={`Schedule for ${format(parseISO(activeMobileDate), "d MMMM yyyy")}`}>
            <header>
              <div><span>{activeMobileDate === today ? "Today" : format(parseISO(activeMobileDate), "EEEE")}</span><h2>{format(parseISO(activeMobileDate), "d MMMM yyyy")}</h2></div>
              <CalendarWeatherBadge day={weatherByDay.get(activeMobileDate)} onOpen={setSelectedWeather} />
              {editable ? <button type="button" onClick={() => onCreateEvent?.(activeMobileDate)} aria-label={`Add event on ${format(parseISO(activeMobileDate), "d MMMM yyyy")}`}><Plus size={16} /> Add</button> : null}
            </header>
            <div className="tablet-calendar-mobile-list">
              {selectedMobileRanges.map((range) => <MobileRangeAgendaCard currentTime={currentTime} editable={editable} key={range.id} onOpen={openRangeItem} palette={palette} range={range} today={today} />)}
              {selectedMobileEvents.map((event) => <MobileDeadlineAgendaCard editable={editable} event={event} key={event.id} onOpen={onEditItem} />)}
              {!selectedMobileRanges.length && !selectedMobileEvents.length ? <div className="tablet-calendar-mobile-empty"><Clock3 size={22} /><strong>Clear day</strong><span>Nothing is scheduled for this date.</span></div> : null}
            </div>
          </section>
        </div>
      ) : <div className="tablet-calendar-scroll">
        <div className="tablet-calendar-weekdays" aria-hidden="true">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="tablet-calendar-grid" style={{ "--tablet-calendar-week-count": calendarWeeks.length } as CSSProperties}>
          {calendarWeeks.map((week) => {
            const displayedRangeLanes = isCapacityCalendar ? week.laneCount : Math.min(week.laneCount, visibleRangeLanes);
            const displayedSegments = isCapacityCalendar
              ? week.segments
              : week.segments.filter((segment) => segment.lane + segment.laneSpan <= visibleRangeLanes);
            const displayedEventLimit = isCapacityCalendar
              ? Math.max(1, ...week.dayKeys.map((dateKey) => eventsByDay.get(dateKey)?.length ?? 0))
              : Math.max(1, 3 - displayedRangeLanes);
            const capacityWeekHeight = isCapacityCalendar
              ? Math.max(220, 40 + displayedRangeLanes * 18 + displayedEventLimit * 24)
              : undefined;

            return (
              <section className="tablet-calendar-week" style={{ "--tablet-calendar-range-space": `${displayedRangeLanes * 18}px`, "--tablet-calendar-week-min-height": capacityWeekHeight ? `${capacityWeekHeight}px` : undefined } as CSSProperties} key={week.dayKeys[0]}>
                <div className="tablet-calendar-days">
                  {week.dayKeys.map((dateKey, dayIndex) => {
                    const day = parseISO(dateKey);
                    const dayEvents = eventsByDay.get(dateKey) ?? [];
                    const hiddenRangeSegments = week.segments.filter((segment) => segment.lane + segment.laneSpan > visibleRangeLanes && segment.startColumn <= dayIndex && segment.startColumn + segment.span > dayIndex);
                    const hiddenDayEvents = dayEvents.slice(displayedEventLimit);
                    const hiddenItems = [...hiddenRangeSegments.map((segment) => segment.item.title), ...hiddenDayEvents.map((event) => event.title)];
                    return (
                      <div className={`tablet-calendar-day ${!isCapacityCalendar && !isSameMonth(day, currentMonth) ? "is-outside" : ""} ${dateKey === today ? "is-today" : ""}`} key={dateKey}>
                        <time dateTime={dateKey}>{format(day, "d")}</time>
                        <CalendarWeatherBadge day={weatherByDay.get(dateKey)} onOpen={setSelectedWeather} />
                        {editable ? <button type="button" className="tablet-calendar-day-add" onClick={() => onCreateEvent?.(dateKey)} aria-label={`Add event on ${format(day, "d MMMM yyyy")}`} title="Add event"><Plus size={11} /></button> : null}
                        <div className="tablet-calendar-day-events">
                          {dayEvents.slice(0, displayedEventLimit).map((event) => (
                            <article
                              className={`tablet-calendar-event is-${event.kind} ${event.isOverdue ? "is-overdue" : ""} ${editable ? "is-editable" : ""} ${event.isComplete ? "is-complete" : ""}`}
                              style={{ "--tablet-calendar-color": event.color } as CSSProperties}
                              title={`${event.label}: ${event.title} · ${event.detail}`}
                              role={editable ? "button" : undefined}
                              tabIndex={editable ? 0 : undefined}
                              onClick={editable ? () => onEditItem?.(event.item) : undefined}
                              onKeyDown={editable ? (keyboardEvent) => {
                                if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                                  keyboardEvent.preventDefault();
                                  onEditItem?.(event.item);
                                }
                              } : undefined}
                              key={event.id}
                            >
                              <i />
                              <div><strong>{event.title}</strong><span>{event.label}</span></div>
                            </article>
                          ))}
                        </div>
                        {hiddenItems.length ? <small className="tablet-calendar-overflow" title={hiddenItems.join(" · ")}>+{hiddenItems.length} more</small> : null}
                      </div>
                    );
                  })}
                </div>
                {displayedSegments.length ? <div className="tablet-calendar-range-layer">{displayedSegments.map((segment) => segment.item.entity_type === "flight-event"
                  ? <FlightRange currentTime={currentTime} editable={editable} onOpen={openRangeItem} palette={palette} segment={segment as CalendarRangeSegment<CalendarFlightEvent>} today={today} key={`${segment.id}-${week.dayKeys[0]}`} />
                  : <JobRange currentTime={currentTime} editable={editable} onOpen={openRangeItem} palette={palette} segment={segment as CalendarRangeSegment<CalendarStandardRangeItem>} today={today} key={`${segment.id}-${week.dayKeys[0]}`} />)}</div> : null}
              </section>
            );
          })}
        </div>
      </div>}
      <CalendarWeatherCredit unavailable={weather.unavailable} />
      {selectedWeather ? <CalendarWeatherDetails day={selectedWeather} onClose={() => setSelectedWeather(null)} /> : null}
    </section>
  );
}
