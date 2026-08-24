"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  addMonths,
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
import { buildCalendarRangeWeeks, getCalendarJobRanges, type CalendarRangeSegment } from "@/lib/calendar-layout";
import type { CalendarJob, CalendarTask } from "@/lib/types";

type TabletCalendarEvent = {
  id: string;
  date: string;
  kind: "job" | "task";
  label: string;
  title: string;
  detail: string;
  color: string;
  isComplete: boolean;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateWindowLabel(startDate: string, endDate: string) {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (format(start, "yyyy") !== format(end, "yyyy")) return `${format(start, "d MMM yyyy")}–${format(end, "d MMM yyyy")}`;
  if (format(start, "yyyy-MM") !== format(end, "yyyy-MM")) return `${format(start, "d MMM")}–${format(end, "d MMM")}`;
  return `${format(start, "d")}–${format(end, "d MMM")}`;
}

function JobRange({ segment }: { segment: CalendarRangeSegment }) {
  const windowLabel = dateWindowLabel(segment.start, segment.end);
  return (
    <article
      aria-label={`${segment.item.title}, scheduled ${windowLabel}, ${segment.durationDays} ${segment.durationDays === 1 ? "day" : "days"}${segment.item.is_complete ? ", completed" : ""}`}
      className={`tablet-calendar-job-range ${segment.startsBeforeWeek ? "continues-before" : ""} ${segment.endsAfterWeek ? "continues-after" : ""} ${segment.item.is_complete ? "is-complete" : ""}`}
      title={`${segment.item.title} · ${windowLabel} · ${segment.item.status_label}`}
      style={{
        "--tablet-calendar-color": segment.item.status_color,
        gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
        gridRow: segment.lane + 1,
      } as CSSProperties}
    >
      <strong>{segment.item.title}</strong>
      <em>{segment.item.client_name ?? "No client"}</em>
      <span>{segment.endsAfterWeek ? "Continues" : `Due ${format(parseISO(segment.end), "d MMM")}`}</span>
    </article>
  );
}

export function TabletCalendar({ jobs, tasks, today }: { jobs: CalendarJob[]; tasks: CalendarTask[]; today: string }) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(parseISO(today)));
  const jobRanges = useMemo(() => getCalendarJobRanges(jobs), [jobs]);
  const rangedJobIds = useMemo(() => new Set(jobRanges.map((range) => range.id)), [jobRanges]);
  const calendarDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 }),
  }), [currentMonth]);
  const calendarWeeks = useMemo(() => buildCalendarRangeWeeks(calendarDays.map((day) => format(day, "yyyy-MM-dd")), jobRanges), [calendarDays, jobRanges]);
  const events = useMemo(() => {
    const jobEvents = jobs.flatMap((job): TabletCalendarEvent[] => {
      if (rangedJobIds.has(job.id)) return [];
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
    return [...jobEvents, ...taskEvents];
  }, [jobs, rangedJobIds, tasks]);
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
          <div><span>Production schedule</span><h1>{format(currentMonth, "MMMM yyyy")}</h1></div>
          <button type="button" onClick={() => setCurrentMonth((month) => addMonths(month, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          <button type="button" className="tablet-calendar-today" onClick={() => setCurrentMonth(startOfMonth(parseISO(today)))}>Today</button>
        </div>
        <div className="tablet-calendar-legend" aria-label="Calendar legend">
          <span><i className="is-job" /> Job window</span>
          <span><i className="is-task" /> Deadline</span>
          <span><i className="is-complete" /> Completed</span>
        </div>
      </header>

      <div className="tablet-calendar-scroll">
        <div className="tablet-calendar-weekdays" aria-hidden="true">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="tablet-calendar-grid">
          {calendarWeeks.map((week) => (
            <section className="tablet-calendar-week" style={{ "--tablet-calendar-range-space": `${week.laneCount * 24}px` } as CSSProperties} key={week.dayKeys[0]}>
              <div className="tablet-calendar-days">
                {week.dayKeys.map((dateKey) => {
                  const day = parseISO(dateKey);
                  const dayEvents = eventsByDay.get(dateKey) ?? [];
                  return (
                    <div className={`tablet-calendar-day ${!isSameMonth(day, currentMonth) ? "is-outside" : ""} ${dateKey === today ? "is-today" : ""}`} key={dateKey}>
                      <time dateTime={dateKey}>{format(day, "d")}</time>
                      <div className="tablet-calendar-day-events">
                        {dayEvents.slice(0, 3).map((event) => (
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
                        {dayEvents.length > 3 ? <small>+{dayEvents.length - 3} more</small> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              {week.segments.length ? <div className="tablet-calendar-range-layer">{week.segments.map((segment) => <JobRange segment={segment} key={`${segment.id}-${week.dayKeys[0]}`} />)}</div> : null}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
