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
import { BriefcaseBusiness, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ListTodo, Megaphone, Plane, Plus } from "lucide-react";
import { buildCalendarRangeWeeks, getCalendarScheduleRanges, type CalendarRangeSegment, type CalendarScheduleRangeItem } from "@/lib/calendar-layout";
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
  mutedColor?: string;
  overdueColor?: string;
};

function normalizeMatchValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU");
}

function itemBelongsToAccentClient(item: CalendarStandardRangeItem | CalendarItem, palette: CalendarPalette) {
  if (!palette.accentClientName) return true;
  return normalizeMatchValue(item.client_name ?? "") === normalizeMatchValue(palette.accentClientName);
}

function isOverdueAccentJob(item: CalendarStandardRangeItem | CalendarItem, palette: CalendarPalette, today: string) {
  return Boolean(
    palette.overdueColor
    && item.entity_type === "job"
    && !item.is_complete
    && item.due_date
    && item.due_date < today
    && itemBelongsToAccentClient(item, palette),
  );
}

function calendarItemColor(item: CalendarStandardRangeItem | CalendarItem, palette: CalendarPalette, today: string) {
  const originalColor = item.entity_type === "calendar-event" ? item.color : item.status_color;
  if (isOverdueAccentJob(item, palette, today)) return palette.overdueColor!;
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

function airlineMark(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
}

function flightHoverDetails(flight: CalendarFlightEvent) {
  return [
    flight.title,
    `${flight.departure_airline}${flight.departure_flight_number ? ` ${flight.departure_flight_number}` : ""}: ${flight.origin_location} · ${flight.departure_date} ${compactTime(flight.departure_time)}`,
    flight.departure_terminal ? `Departure terminal: ${flight.departure_terminal}` : null,
    `${flight.arrival_airline}${flight.arrival_flight_number ? ` ${flight.arrival_flight_number}` : ""}: ${flight.destination_location} · ${flight.arrival_date} ${compactTime(flight.arrival_time)}`,
    flight.arrival_terminal ? `Arrival terminal: ${flight.arrival_terminal}` : null,
    flight.travel_class ? `Class: ${flight.travel_class}` : null,
    flight.seat_number ? `Seat: ${flight.seat_number}` : null,
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

function MobileRangeAgendaCard({ editable, onOpen, palette, range, today }: { editable: boolean; onOpen: (item: CalendarScheduleRangeItem) => void; palette: CalendarPalette; range: ReturnType<typeof getCalendarScheduleRanges>[number]; today: string }) {
  const item = range.item;
  const isFlight = item.entity_type === "flight-event";
  const isCalendarEvent = item.entity_type === "calendar-event";
  const isComplete = isCalendarEvent || isFlight ? false : item.is_complete;
  const isOverdue = !isFlight && !isCalendarEvent && isOverdueAccentJob(item, palette, today);
  const color = isFlight ? item.color : calendarItemColor(item, palette, today);
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
    ? `${compactTime(item.departure_time)} ${item.origin_location} → ${compactTime(item.arrival_time)} ${item.destination_location}`
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
      <span className="tablet-calendar-mobile-entry-copy"><small>{kicker}</small><strong>{item.title}</strong>{detail ? <em>{detail}</em> : null}</span>
      <span className="tablet-calendar-mobile-entry-side">{isComplete ? <CheckCircle2 size={16} /> : editable ? <ChevronRight size={16} /> : null}</span>
    </article>
  );
}

function MobileDeadlineAgendaCard({ editable, event, onOpen }: { editable: boolean; event: TabletCalendarEvent; onOpen?: (item: CalendarItem) => void }) {
  const Icon = event.kind === "task" ? ListTodo : event.kind === "campaign" ? Megaphone : BriefcaseBusiness;
  return (
    <article
      className={`tablet-calendar-mobile-entry is-deadline ${event.isOverdue ? "is-overdue" : ""} ${event.isComplete ? "is-complete" : ""} ${editable ? "is-editable" : ""}`}
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
      <span className="tablet-calendar-mobile-entry-icon"><Icon size={17} /></span>
      <span className="tablet-calendar-mobile-entry-copy"><small>{event.label}</small><strong>{event.title}</strong><em>{event.detail}</em></span>
      <span className="tablet-calendar-mobile-entry-side">{event.isComplete ? <CheckCircle2 size={16} /> : editable ? <ChevronRight size={16} /> : null}</span>
    </article>
  );
}

function FlightRange({ editable, onOpen, segment }: { editable: boolean; onOpen: (item: CalendarScheduleRangeItem) => void; segment: CalendarRangeSegment<CalendarFlightEvent> }) {
  const flight = segment.item;
  const showDeparture = !segment.startsBeforeWeek;
  const showArrival = !segment.endsAfterWeek;
  return (
    <article
      aria-label={`${flight.title}, flight from ${flight.origin_location} to ${flight.destination_location}`}
      className={`tablet-calendar-job-range tablet-calendar-flight-range ${editable ? "is-editable" : ""} ${segment.startsBeforeWeek ? "continues-before" : ""} ${segment.endsAfterWeek ? "continues-after" : ""}`}
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
        "--tablet-calendar-color": flight.color,
        gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
        gridRow: `${segment.lane + 1} / span ${segment.laneSpan}`,
      } as CSSProperties}
    >
      <div className={`flight-range-endpoint ${showDeparture ? "" : "is-hidden"}`}>
        <b aria-hidden="true">{airlineMark(flight.departure_airline)}</b>
        <span>{compactTime(flight.departure_time)}</span>
        <small>{flight.origin_location}</small>
      </div>
      <div className="flight-range-title">
        <Plane size={12} aria-hidden="true" />
        <strong>{flight.title}</strong>
        <em>{flight.origin_location} → {flight.destination_location}</em>
      </div>
      <div className={`flight-range-endpoint is-arrival ${showArrival ? "" : "is-hidden"}`}>
        <b aria-hidden="true">{airlineMark(flight.arrival_airline)}</b>
        <span>{compactTime(flight.arrival_time)}</span>
        <small>{flight.destination_location}</small>
      </div>
    </article>
  );
}

function JobRange({ editable, onOpen, palette, segment, today }: { editable: boolean; onOpen: (item: CalendarScheduleRangeItem) => void; palette: CalendarPalette; segment: CalendarRangeSegment<CalendarStandardRangeItem>; today: string }) {
  const windowLabel = dateWindowLabel(segment.start, segment.end);
  const isCalendarEvent = segment.item.entity_type === "calendar-event";
  const isComplete = segment.item.entity_type === "calendar-event" ? false : segment.item.is_complete;
  const isOverdue = isOverdueAccentJob(segment.item, palette, today);
  const rangeColor = calendarItemColor(segment.item, palette, today);
  const context = segment.item.entity_type === "calendar-event"
    ? segment.item.location
    : segment.item.entity_type === "campaign-asset"
      ? segment.item.campaign_title
      : segment.item.client_name ?? "No client";
  const statusLabel = segment.item.entity_type === "calendar-event" ? "Calendar event" : segment.item.status_label;
  return (
    <article
      aria-label={`${segment.item.title}, scheduled ${windowLabel}, ${segment.durationDays} ${segment.durationDays === 1 ? "day" : "days"}${isOverdue ? ", overdue" : ""}${isComplete ? ", completed" : ""}`}
      className={`tablet-calendar-job-range ${editable ? "is-editable" : ""} ${isCalendarEvent ? "is-calendar-event" : ""} ${isOverdue ? "is-overdue" : ""} ${segment.startsBeforeWeek ? "continues-before" : ""} ${segment.endsAfterWeek ? "continues-after" : ""} ${isComplete ? "is-complete" : ""}`}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      onClick={editable ? () => onOpen(segment.item) : undefined}
      onKeyDown={editable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(segment.item);
        }
      } : undefined}
      title={`${segment.item.title} · ${windowLabel}${context ? ` · ${context}` : ""} · ${statusLabel}`}
      style={{
        "--tablet-calendar-color": rangeColor,
        gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
        gridRow: `${segment.lane + 1} / span ${segment.laneSpan}`,
      } as CSSProperties}
    >
      <strong>{segment.item.title}</strong>
      {!isCalendarEvent ? <em>{context}</em> : null}
      {!isCalendarEvent ? <span>{segment.endsAfterWeek ? "Continues" : `Due ${format(parseISO(segment.end), "d MMM")}`}</span> : null}
    </article>
  );
}

export function TabletCalendar({ accentColor, accentClientName, accentKeywords, mutedColor, overdueColor, jobs, tasks, campaignAssets = [], customEvents = [], flightEvents = [], density = "standard", editable = false, onCreateEvent, onEditEvent, onEditFlight, onEditItem, today }: CalendarPalette & { jobs: CalendarJob[]; tasks: CalendarTask[]; campaignAssets?: CalendarCampaignAsset[]; customEvents?: CalendarCustomEvent[]; flightEvents?: CalendarFlightEvent[]; density?: "standard" | "capacity"; editable?: boolean; onCreateEvent?: (date: string) => void; onEditEvent?: (event: CalendarCustomEvent) => void; onEditFlight?: (event: CalendarFlightEvent) => void; onEditItem?: (item: CalendarItem) => void; today: string }) {
  const todayDate = useMemo(() => parseISO(today), [today]);
  const [currentMonth, setCurrentMonth] = useState(() => density === "capacity" ? todayDate : startOfMonth(todayDate));
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [selectedMobileDate, setSelectedMobileDate] = useState(today);
  const isCapacityCalendar = density === "capacity";
  const capacityWindowDays = isCapacityCalendar
    ? isCompactViewport ? capacityMobileWindowDays : capacityDesktopWindowDays
    : undefined;
  const palette = useMemo(() => ({ accentClientName, accentColor, accentKeywords, mutedColor, overdueColor }), [accentClientName, accentColor, accentKeywords, mutedColor, overdueColor]);
  const scheduleRanges = useMemo(() => getCalendarScheduleRanges([...jobs, ...campaignAssets, ...customEvents, ...flightEvents]), [campaignAssets, customEvents, flightEvents, jobs]);
  const rangedItemKeys = useMemo(() => new Set(scheduleRanges.map((range) => `${range.item.entity_type}:${range.item.id}`)), [scheduleRanges]);
  const calendarWindow = useMemo(() => getCalendarWindow(currentMonth, todayDate, capacityWindowDays), [capacityWindowDays, currentMonth, todayDate]);
  const calendarDays = useMemo(() => eachDayOfInterval(calendarWindow), [calendarWindow]);
  const calendarWeeks = useMemo(() => buildCalendarRangeWeeks(calendarDays.map((day) => format(day, "yyyy-MM-dd")), scheduleRanges), [calendarDays, scheduleRanges]);
  const firstCalendarDay = format(calendarWindow.start, "yyyy-MM-dd");
  const lastCalendarDay = format(calendarWindow.end, "yyyy-MM-dd");
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
        color: calendarItemColor(job, palette, today),
        isComplete: job.is_complete,
        isOverdue: isOverdueAccentJob(job, palette, today),
        item: job,
      });
      if (job.due_date && job.due_date !== job.shoot_date) eventsForJob.push({
        id: `${job.id}-due`,
        date: job.due_date,
        kind: "job",
        label: "Job due",
        title: job.title,
        detail: job.client_name ?? "No client",
        color: calendarItemColor(job, palette, today),
        isComplete: job.is_complete,
        isOverdue: isOverdueAccentJob(job, palette, today),
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
      color: calendarItemColor(task, palette, today),
      isComplete: task.is_complete,
      isOverdue: false,
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
        color: calendarItemColor(asset, palette, today),
        isComplete: asset.is_complete,
        isOverdue: false,
        item: asset,
      }];
    });
    return [...jobEvents, ...taskEvents, ...campaignEvents];
  }, [campaignAssets, jobs, palette, rangedItemKeys, tasks, today]);
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
    <section className={`tablet-calendar ${isCapacityCalendar ? "is-capacity" : ""} ${isCompactViewport ? "is-compact-window" : ""} ${editable ? "is-editable" : "is-read-only"}`} aria-label="Production calendar">
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
          <span><i className="is-complete" /> Completed</span>
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
                  <span>{format(day, "EEE")}</span><strong>{format(day, "d")}</strong>{count ? <i aria-label={`${count} scheduled items`}>{count}</i> : <i aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <section className="tablet-calendar-mobile-agenda" aria-label={`Schedule for ${format(parseISO(activeMobileDate), "d MMMM yyyy")}`}>
            <header>
              <div><span>{activeMobileDate === today ? "Today" : format(parseISO(activeMobileDate), "EEEE")}</span><h2>{format(parseISO(activeMobileDate), "d MMMM yyyy")}</h2></div>
              {editable ? <button type="button" onClick={() => onCreateEvent?.(activeMobileDate)} aria-label={`Add event on ${format(parseISO(activeMobileDate), "d MMMM yyyy")}`}><Plus size={16} /> Add</button> : null}
            </header>
            <div className="tablet-calendar-mobile-list">
              {selectedMobileRanges.map((range) => <MobileRangeAgendaCard editable={editable} key={range.id} onOpen={openRangeItem} palette={palette} range={range} today={today} />)}
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
                  ? <FlightRange editable={editable} onOpen={openRangeItem} segment={segment as CalendarRangeSegment<CalendarFlightEvent>} key={`${segment.id}-${week.dayKeys[0]}`} />
                  : <JobRange editable={editable} onOpen={openRangeItem} palette={palette} segment={segment as CalendarRangeSegment<CalendarStandardRangeItem>} today={today} key={`${segment.id}-${week.dayKeys[0]}`} />)}</div> : null}
              </section>
            );
          })}
        </div>
      </div>}
    </section>
  );
}
