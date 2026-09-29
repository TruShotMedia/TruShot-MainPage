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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildCalendarRangeWeeks, getCalendarScheduleRanges, type CalendarRangeSegment, type CalendarScheduleRangeItem } from "@/lib/calendar-layout";
import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarJob, CalendarTask } from "@/lib/types";

type TabletCalendarEvent = {
  id: string;
  date: string;
  kind: "job" | "task" | "campaign";
  label: string;
  title: string;
  detail: string;
  color: string;
  isComplete: boolean;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calendarWindowDays = 42;
const visibleRangeLanes = 2;

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

function JobRange({ segment }: { segment: CalendarRangeSegment<CalendarScheduleRangeItem> }) {
  const windowLabel = dateWindowLabel(segment.start, segment.end);
  const isCalendarEvent = segment.item.entity_type === "calendar-event";
  const isComplete = segment.item.entity_type === "calendar-event" ? false : segment.item.is_complete;
  const rangeColor = segment.item.entity_type === "calendar-event" ? segment.item.color : segment.item.status_color;
  const context = segment.item.entity_type === "calendar-event"
    ? segment.item.location
    : segment.item.entity_type === "campaign-asset"
      ? segment.item.campaign_title
      : segment.item.client_name ?? "No client";
  const statusLabel = segment.item.entity_type === "calendar-event" ? "Calendar event" : segment.item.status_label;
  return (
    <article
      aria-label={`${segment.item.title}, scheduled ${windowLabel}, ${segment.durationDays} ${segment.durationDays === 1 ? "day" : "days"}${isComplete ? ", completed" : ""}`}
      className={`tablet-calendar-job-range ${isCalendarEvent ? "is-calendar-event" : ""} ${segment.startsBeforeWeek ? "continues-before" : ""} ${segment.endsAfterWeek ? "continues-after" : ""} ${isComplete ? "is-complete" : ""}`}
      title={`${segment.item.title} · ${windowLabel}${context ? ` · ${context}` : ""} · ${statusLabel}`}
      style={{
        "--tablet-calendar-color": rangeColor,
        gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
        gridRow: segment.lane + 1,
      } as CSSProperties}
    >
      <strong>{segment.item.title}</strong>
      {!isCalendarEvent ? <em>{context}</em> : null}
      {!isCalendarEvent ? <span>{segment.endsAfterWeek ? "Continues" : `Due ${format(parseISO(segment.end), "d MMM")}`}</span> : null}
    </article>
  );
}

export function TabletCalendar({ jobs, tasks, campaignAssets = [], customEvents = [], today }: { jobs: CalendarJob[]; tasks: CalendarTask[]; campaignAssets?: CalendarCampaignAsset[]; customEvents?: CalendarCustomEvent[]; today: string }) {
  const todayDate = useMemo(() => parseISO(today), [today]);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(todayDate));
  const scheduleRanges = useMemo(() => getCalendarScheduleRanges([...jobs, ...campaignAssets, ...customEvents]), [campaignAssets, customEvents, jobs]);
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
        color: job.status_color,
        isComplete: job.is_complete,
      });
      if (job.due_date && job.due_date !== job.shoot_date) eventsForJob.push({
        id: `${job.id}-due`,
        date: job.due_date,
        kind: "job",
        label: "Job due",
        title: job.title,
        detail: job.client_name ?? "No client",
        color: job.status_color,
        isComplete: job.is_complete,
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
      color: task.status_color,
      isComplete: task.is_complete,
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
        color: asset.status_color,
        isComplete: asset.is_complete,
      }];
    });
    return [...jobEvents, ...taskEvents, ...campaignEvents];
  }, [campaignAssets, jobs, rangedItemKeys, tasks]);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, TabletCalendarEvent[]>();
    for (const event of events) grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    return grouped;
  }, [events]);

  return (
    <section className="tablet-calendar" aria-label="Production calendar">
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
          <span><i className="is-complete" /> Completed</span>
        </div>
      </header>

      <div className="tablet-calendar-scroll">
        <div className="tablet-calendar-weekdays" aria-hidden="true">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="tablet-calendar-grid" style={{ "--tablet-calendar-week-count": calendarWeeks.length } as CSSProperties}>
          {calendarWeeks.map((week) => {
            const displayedRangeLanes = Math.min(week.laneCount, visibleRangeLanes);
            const displayedSegments = week.segments.filter((segment) => segment.lane < visibleRangeLanes);
            const displayedEventLimit = Math.max(1, 3 - displayedRangeLanes);

            return (
              <section className="tablet-calendar-week" style={{ "--tablet-calendar-range-space": `${displayedRangeLanes * 18}px` } as CSSProperties} key={week.dayKeys[0]}>
                <div className="tablet-calendar-days">
                  {week.dayKeys.map((dateKey, dayIndex) => {
                    const day = parseISO(dateKey);
                    const dayEvents = eventsByDay.get(dateKey) ?? [];
                    const hiddenRangeSegments = week.segments.filter((segment) => segment.lane >= visibleRangeLanes && segment.startColumn <= dayIndex && segment.startColumn + segment.span > dayIndex);
                    const hiddenDayEvents = dayEvents.slice(displayedEventLimit);
                    const hiddenItems = [...hiddenRangeSegments.map((segment) => segment.item.title), ...hiddenDayEvents.map((event) => event.title)];
                    return (
                      <div className={`tablet-calendar-day ${!isSameMonth(day, currentMonth) ? "is-outside" : ""} ${dateKey === today ? "is-today" : ""}`} key={dateKey}>
                        <time dateTime={dateKey}>{format(day, "d")}</time>
                        <div className="tablet-calendar-day-events">
                          {dayEvents.slice(0, displayedEventLimit).map((event) => (
                            <article
                              className={`tablet-calendar-event is-${event.kind} ${event.isComplete ? "is-complete" : ""}`}
                              style={{ "--tablet-calendar-color": event.color } as CSSProperties}
                              title={`${event.label}: ${event.title} · ${event.detail}`}
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
                {displayedSegments.length ? <div className="tablet-calendar-range-layer">{displayedSegments.map((segment) => <JobRange segment={segment} key={`${segment.id}-${week.dayKeys[0]}`} />)}</div> : null}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
