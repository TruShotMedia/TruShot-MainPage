"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { TabletCalendar } from "@/components/tablet/tablet-calendar";
import { ProductionMobileSchedule } from "./production-mobile-schedule";
import {
  productionDayAgenda,
  type AgendaSource,
} from "@/lib/production-agenda";
import type {
  CalendarCampaignAsset,
  CalendarCustomEvent,
  CalendarFlightEvent,
  CalendarItem,
  CalendarJob,
  CalendarTask,
} from "@/lib/types";
import type { TabletCreateKind } from "@/components/tablet/tablet-workspace-editors";
type ScheduleData = {
  calendarJobs: CalendarJob[];
  calendarTasks: CalendarTask[];
  calendarEvents: CalendarCustomEvent[];
  flightEvents: CalendarFlightEvent[];
  calendarCampaignAssets?: CalendarCampaignAsset[];
};
function agendaTone(source: AgendaSource, today: string) {
  const related =
    (source.client_name ?? "").toLowerCase() === "autopacific group";
  if (!related) return "is-unrelated";
  if ("is_complete" in source && source.is_complete) return "is-complete";
  if (
    (source.entity_type === "calendar-event" && source.end_date < today) ||
    (source.entity_type === "flight-event" && source.arrival_date < today)
  )
    return "is-complete";
  if ("due_date" in source && source.due_date && source.due_date < today)
    return "is-overdue";
  return "is-autopacific";
}
export function TimedSchedule({
  data,
  dates,
  today,
  onOpen,
}: {
  data: ScheduleData;
  dates: string[];
  today: string;
  onOpen: (source: AgendaSource) => void;
}) {
  const agendas = dates.map((date) =>
    productionDayAgenda(date, {
      jobs: data.calendarJobs,
      tasks: data.calendarTasks,
      events: data.calendarEvents,
      flights: data.flightEvents,
    }),
  );
  const blocks = agendas.flatMap((day) => day.timed);
  const firstHour = Math.min(
    8,
    Math.floor(Math.min(...blocks.map((block) => block.start), 480) / 60),
  );
  const lastHour = Math.min(
    24,
    Math.max(
      18,
      Math.ceil(Math.max(...blocks.map((block) => block.end), 1080) / 60),
    ),
  );
  const hours = Array.from(
    { length: lastHour - firstHour },
    (_, index) => firstHour + index,
  );
  return (
    <section
      className={`production-timetable ${dates.length === 1 ? "is-day" : "is-week"}`}
      aria-label={dates.length === 1 ? "Day schedule" : "Week schedule"}
    >
      <div
        className="timetable-day-labels"
        style={{
          gridTemplateColumns: `48px repeat(${dates.length},minmax(0,1fr))`,
        }}
      >
        <span>Brisbane</span>
        {dates.map((date) => (
          <strong key={date}>{format(parseISO(date), "EEE d MMM")}</strong>
        ))}
      </div>
      <div
        className="timetable-all-day"
        style={{
          gridTemplateColumns: `48px repeat(${dates.length},minmax(0,1fr))`,
        }}
      >
        <small>
          All day
          <br />& due
        </small>
        {agendas.map((agenda, index) => (
          <div key={dates[index]}>
            {agenda.allDay.map((item) => (
              <button
                type="button"
                key={item.id}
                className={agendaTone(item.source, today)}
                onClick={() => onOpen(item.source)}
              >
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
            {!agenda.allDay.length ? (
              <span className="timetable-empty">—</span>
            ) : null}
          </div>
        ))}
      </div>
      <div
        className="timetable-hours"
        style={{
          height: hours.length * 64,
          gridTemplateColumns: `48px repeat(${dates.length},minmax(0,1fr))`,
        }}
      >
        <div className="timetable-time-labels">
          {hours.map((hour) => (
            <time
              key={hour}
              style={{ top: (hour - firstHour) * 64 }}
            >{`${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`}</time>
          ))}
        </div>
        {agendas.map((agenda, index) => (
          <div
            key={dates[index]}
            className="timetable-day-column"
            style={{ backgroundSize: "100% 64px" }}
          >
            {agenda.timed.map((block) => (
              <button
                key={block.id}
                type="button"
                className={`timetable-booking ${block.end-block.start<45?"is-short":""} ${agendaTone(block.source, today)}`}
                style={
                  {
                    top: ((block.start - firstHour * 60) * 64) / 60,
                    height: Math.max(
                      14,
                      ((block.end - block.start) * 64) / 60 - 3,
                    ),
                    left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / block.lanes}% - 4px)`,
                  } as CSSProperties
                }
                onClick={() => onOpen(block.source)}
                aria-label={`${block.title}, ${block.time}, ${block.detail}`}
                title={`${block.title} · ${block.time} · ${block.detail}`}
              >
                <small>{block.time}</small>
                <strong>{block.title}</strong>
                {block.end - block.start >= 60 ? (
                  <span>{block.detail}</span>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
export function ProductionCalendar({
  data,
  today,
  todayOnly = false,
  mobile = false,
  marketing,
  personalTools = false,
  onOpenItem,
  onOpenEvent,
  onOpenFlight,
  onCreate,
}: {
  data: ScheduleData;
  today: string;
  todayOnly?: boolean;
  mobile?: boolean;
  marketing: boolean;
  personalTools?: boolean;
  onOpenItem: (item: CalendarItem) => void;
  onOpenEvent: (event: CalendarCustomEvent) => void;
  onOpenFlight: (flight: CalendarFlightEvent) => void;
  onCreate: (kind: TabletCreateKind, date?: string) => void;
}) {
  const [mode, setMode] = useState<"fortnight" | "week" | "day">(
    todayOnly ? "day" : "fortnight",
  );
  const [date, setDate] = useState(today);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const currentTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Brisbane",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  function open(source: AgendaSource) {
    if (source.entity_type === "calendar-event") onOpenEvent(source);
    else if (source.entity_type === "flight-event") onOpenFlight(source);
    else onOpenItem(source);
  }
  const first =
    mode === "week"
      ? startOfWeek(parseISO(date), { weekStartsOn: 1 })
      : parseISO(date);
  const dates = Array.from({ length: mode === "week" ? 7 : 1 }, (_, index) =>
    format(addDays(first, index), "yyyy-MM-dd"),
  );
  const range = data.calendarJobs.filter(
    (job) => job.status_label.toLowerCase() !== "planning",
  );
  const schedule = { ...data, calendarJobs: range };
  if (mobile) return <ProductionMobileSchedule data={schedule} today={today} todayOnly={todayOnly} marketing={marketing} onOpen={open} onCreate={date => onCreate("event", date)} />;
  return (
    <div className="production-calendar-workspace">
      <div className="production-calendar-views">
        <div className="apg-view-pills" aria-label="Schedule view">
          {(!todayOnly ? ["fortnight", "week", "day"] : ["day"]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key as typeof mode)}
            >
              {key === "fortnight"
                ? "Fortnight"
                : key[0].toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
        {mode !== "fortnight" ? (
          <div className="production-day-controls">
            <button
              type="button"
              aria-label="Previous schedule period"
              onClick={() =>
                setDate(
                  format(
                    addDays(parseISO(date), mode === "week" ? -7 : -1),
                    "yyyy-MM-dd",
                  ),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              aria-label="Schedule date"
              value={date}
              onChange={(event) => {
                if (event.target.value) setDate(event.target.value);
              }}
            />
            <button
              type="button"
              aria-label="Next schedule period"
              onClick={() =>
                setDate(
                  format(
                    addDays(parseISO(date), mode === "week" ? 7 : 1),
                    "yyyy-MM-dd",
                  ),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
            <button type="button" onClick={() => setDate(today)}>
              Today
            </button>
          </div>
        ) : null}
        <button type="button" onClick={() => onCreate("event", date)}>
          <Plus size={14} /> Event
        </button>
      </div>
      {mode === "fortnight" ? (
        <TabletCalendar
          currentTime={currentTime}
          weatherLocationKey={marketing ? "melbourne-city" : "brisbane-city"}
          accentColor="#5d91b0"
          accentClientName="Autopacific Group"
          completedColor="#3f9b68"
          mutedColor="#687177"
          overdueColor="#c5524a"
          density="capacity"
          jobs={range}
          tasks={data.calendarTasks}
          campaignAssets={data.calendarCampaignAssets ?? []}
          customEvents={data.calendarEvents}
          flightEvents={data.flightEvents}
          editable
          onCreateEvent={(date) => onCreate("event", date)}
          onEditItem={onOpenItem}
          onEditEvent={onOpenEvent}
          onEditFlight={onOpenFlight}
          today={today}
        />
      ) : (
        <TimedSchedule
          data={schedule}
          dates={dates}
          today={today}
          onOpen={open}
        />
      )}
      {todayOnly ? (
        <section className="production-deadline-list">
          <h2>Still needs attention</h2>
          {[...data.calendarJobs, ...data.calendarTasks]
            .filter(
              (item) =>
                !item.is_complete && item.due_date && item.due_date <= today,
            )
            .map((item) => (
              <button
                type="button"
                key={`${item.entity_type}:${item.id}`}
                className={agendaTone(item, today)}
                onClick={() => onOpenItem(item)}
              >
                <strong>{item.title}</strong>
                <span>
                  {item.due_date === today
                    ? "Due today"
                    : `Overdue · ${format(parseISO(item.due_date!), "d MMM")}`}
                </span>
              </button>
            ))}
        </section>
      ) : null}
      {marketing && !personalTools ? (
        <p className="brief-help">
          Tasks and flights are visible for planning. Task editing and flight
          creation stay with production.
        </p>
      ) : null}
    </div>
  );
}
