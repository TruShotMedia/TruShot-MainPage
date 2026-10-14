"use client";

import { useMemo, useState, type CSSProperties } from "react";
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
import { ChevronLeft, ChevronRight, Plane, Plus } from "lucide-react";
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
  item: CalendarItem;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calendarWindowDays = 42;
const visibleRangeLanes = 3;
type CalendarStandardRangeItem = Exclude<CalendarScheduleRangeItem, CalendarFlightEvent>;

type CalendarPalette = {
  accentClientName?: string;
  accentColor?: string;
  accentKeywords?: string[];
  mutedColor?: string;
};

function normalizeMatchValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU");
}

function itemBelongsToAccentClient(item: CalendarStandardRangeItem | CalendarItem, palette: CalendarPalette) {
  if (!palette.accentClientName) return true;
  if ("client_name" in item) {
    return normalizeMatchValue(item.client_name ?? "") === normalizeMatchValue(palette.accentClientName);
  }

  const searchable = normalizeMatchValue([
    item.title,
    item.entity_type === "calendar-event" ? item.description ?? "" : "",
  ].join(" "));
  const keywords = [palette.accentClientName, ...(palette.accentKeywords ?? [])]
    .map(normalizeMatchValue)
    .filter(Boolean);
  return keywords.some((keyword) => searchable.includes(keyword));
}

function calendarItemColor(item: CalendarStandardRangeItem | CalendarItem, palette: CalendarPalette) {
  const originalColor = item.entity_type === "calendar-event" ? item.color : item.status_color;
  if (!palette.accentColor) return originalColor;
  if (itemBelongsToAccentClient(item, palette)) return palette.accentColor;
  return palette.mutedColor ?? "#687177";
}

function getCalendarWindow(month: Date, today: Date) {
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
    `${flight.arrival_airline}${flight.arrival_flight_number ? ` ${flight.arrival_flight_number}` : ""}: ${flight.destination_location} · ${flight.arrival_date} ${compactTime(flight.arrival_time)}`,
    flight.accommodation_title ? `Accommodation: ${flight.accommodation_title}${flight.accommodation_location ? ` · ${flight.accommodation_location}` : ""}${flight.accommodation_notes ? ` · ${flight.accommodation_notes}` : ""}` : null,
    flight.vehicle_title ? `Vehicle: ${flight.vehicle_title}${flight.vehicle_location ? ` · ${flight.vehicle_location}` : ""}${flight.vehicle_notes ? ` · ${flight.vehicle_notes}` : ""}` : null,
    flight.notes,
  ].filter(Boolean).join("\n");
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

function JobRange({ editable, onOpen, palette, segment }: { editable: boolean; onOpen: (item: CalendarScheduleRangeItem) => void; palette: CalendarPalette; segment: CalendarRangeSegment<CalendarStandardRangeItem> }) {
  const windowLabel = dateWindowLabel(segment.start, segment.end);
  const isCalendarEvent = segment.item.entity_type === "calendar-event";
  const isComplete = segment.item.entity_type === "calendar-event" ? false : segment.item.is_complete;
  const rangeColor = calendarItemColor(segment.item, palette);
  const context = segment.item.entity_type === "calendar-event"
    ? segment.item.location
    : segment.item.entity_type === "campaign-asset"
      ? segment.item.campaign_title
      : segment.item.client_name ?? "No client";
  const statusLabel = segment.item.entity_type === "calendar-event" ? "Calendar event" : segment.item.status_label;
  return (
    <article
      aria-label={`${segment.item.title}, scheduled ${windowLabel}, ${segment.durationDays} ${segment.durationDays === 1 ? "day" : "days"}${isComplete ? ", completed" : ""}`}
      className={`tablet-calendar-job-range ${editable ? "is-editable" : ""} ${isCalendarEvent ? "is-calendar-event" : ""} ${segment.startsBeforeWeek ? "continues-before" : ""} ${segment.endsAfterWeek ? "continues-after" : ""} ${isComplete ? "is-complete" : ""}`}
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

export function TabletCalendar({ accentColor, accentClientName, accentKeywords, mutedColor, jobs, tasks, campaignAssets = [], customEvents = [], flightEvents = [], editable = false, onCreateEvent, onEditEvent, onEditFlight, onEditItem, today }: CalendarPalette & { jobs: CalendarJob[]; tasks: CalendarTask[]; campaignAssets?: CalendarCampaignAsset[]; customEvents?: CalendarCustomEvent[]; flightEvents?: CalendarFlightEvent[]; editable?: boolean; onCreateEvent?: (date: string) => void; onEditEvent?: (event: CalendarCustomEvent) => void; onEditFlight?: (event: CalendarFlightEvent) => void; onEditItem?: (item: CalendarItem) => void; today: string }) {
  const todayDate = useMemo(() => parseISO(today), [today]);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(todayDate));
  const palette = useMemo(() => ({ accentClientName, accentColor, accentKeywords, mutedColor }), [accentClientName, accentColor, accentKeywords, mutedColor]);
  const scheduleRanges = useMemo(() => getCalendarScheduleRanges([...jobs, ...campaignAssets, ...customEvents, ...flightEvents]), [campaignAssets, customEvents, flightEvents, jobs]);
  const rangedItemKeys = useMemo(() => new Set(scheduleRanges.map((range) => `${range.item.entity_type}:${range.item.id}`)), [scheduleRanges]);
  const calendarWindow = useMemo(() => getCalendarWindow(currentMonth, todayDate), [currentMonth, todayDate]);
  const calendarDays = useMemo(() => eachDayOfInterval(calendarWindow), [calendarWindow]);
  const calendarWeeks = useMemo(() => buildCalendarRangeWeeks(calendarDays.map((day) => format(day, "yyyy-MM-dd")), scheduleRanges), [calendarDays, scheduleRanges]);
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
        color: calendarItemColor(job, palette),
        isComplete: job.is_complete,
        item: job,
      });
      if (job.due_date && job.due_date !== job.shoot_date) eventsForJob.push({
        id: `${job.id}-due`,
        date: job.due_date,
        kind: "job",
        label: "Job due",
        title: job.title,
        detail: job.client_name ?? "No client",
        color: calendarItemColor(job, palette),
        isComplete: job.is_complete,
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
      color: calendarItemColor(task, palette),
      isComplete: task.is_complete,
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
        color: calendarItemColor(asset, palette),
        isComplete: asset.is_complete,
        item: asset,
      }];
    });
    return [...jobEvents, ...taskEvents, ...campaignEvents];
  }, [campaignAssets, jobs, palette, rangedItemKeys, tasks]);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, TabletCalendarEvent[]>();
    for (const event of events) grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    return grouped;
  }, [events]);

  function openRangeItem(item: CalendarScheduleRangeItem) {
    if (!editable) return;
    if (item.entity_type === "calendar-event") onEditEvent?.(item);
    else if (item.entity_type === "flight-event") onEditFlight?.(item);
    else onEditItem?.(item);
  }

  return (
    <section className={`tablet-calendar ${editable ? "is-editable" : "is-read-only"}`} aria-label="Production calendar">
      <header className="tablet-calendar-toolbar">
        <div className="tablet-calendar-month-controls">
          <button type="button" onClick={() => setCurrentMonth((month) => subMonths(month, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <div><span>{calendarWindow.isRolling ? `Rolling · through ${format(calendarWindow.end, "d MMM")}` : "Six-week schedule"}</span><h1>{format(currentMonth, "MMMM yyyy")}</h1></div>
          <button type="button" onClick={() => setCurrentMonth((month) => addMonths(month, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          <button type="button" className="tablet-calendar-today" onClick={() => setCurrentMonth(startOfMonth(todayDate))}>Today</button>
        </div>
        <div className="tablet-calendar-legend" aria-label="Calendar legend">
          <span><i className="is-job" /> Job window</span>
          <span><i className="is-task" /> Deadline</span>
          <span><i className="is-campaign" /> Campaign</span>
          <span><i className="is-calendar-event" /> Event</span>
          <span><i className="is-flight" /> Flight</span>
          <span><i className="is-complete" /> Completed</span>
        </div>
      </header>

      <div className="tablet-calendar-scroll">
        <div className="tablet-calendar-weekdays" aria-hidden="true">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="tablet-calendar-grid" style={{ "--tablet-calendar-week-count": calendarWeeks.length } as CSSProperties}>
          {calendarWeeks.map((week) => {
            const displayedRangeLanes = Math.min(week.laneCount, visibleRangeLanes);
            const displayedSegments = week.segments.filter((segment) => segment.lane + segment.laneSpan <= visibleRangeLanes);
            const displayedEventLimit = Math.max(1, 3 - displayedRangeLanes);

            return (
              <section className="tablet-calendar-week" style={{ "--tablet-calendar-range-space": `${displayedRangeLanes * 18}px` } as CSSProperties} key={week.dayKeys[0]}>
                <div className="tablet-calendar-days">
                  {week.dayKeys.map((dateKey, dayIndex) => {
                    const day = parseISO(dateKey);
                    const dayEvents = eventsByDay.get(dateKey) ?? [];
                    const hiddenRangeSegments = week.segments.filter((segment) => segment.lane + segment.laneSpan > visibleRangeLanes && segment.startColumn <= dayIndex && segment.startColumn + segment.span > dayIndex);
                    const hiddenDayEvents = dayEvents.slice(displayedEventLimit);
                    const hiddenItems = [...hiddenRangeSegments.map((segment) => segment.item.title), ...hiddenDayEvents.map((event) => event.title)];
                    return (
                      <div className={`tablet-calendar-day ${!isSameMonth(day, currentMonth) ? "is-outside" : ""} ${dateKey === today ? "is-today" : ""}`} key={dateKey}>
                        <time dateTime={dateKey}>{format(day, "d")}</time>
                        {editable ? <button type="button" className="tablet-calendar-day-add" onClick={() => onCreateEvent?.(dateKey)} aria-label={`Add event on ${format(day, "d MMMM yyyy")}`} title="Add event"><Plus size={11} /></button> : null}
                        <div className="tablet-calendar-day-events">
                          {dayEvents.slice(0, displayedEventLimit).map((event) => (
                            <article
                              className={`tablet-calendar-event is-${event.kind} ${editable ? "is-editable" : ""} ${event.isComplete ? "is-complete" : ""}`}
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
                  : <JobRange editable={editable} onOpen={openRangeItem} palette={palette} segment={segment as CalendarRangeSegment<CalendarStandardRangeItem>} key={`${segment.id}-${week.dayKeys[0]}`} />)}</div> : null}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
