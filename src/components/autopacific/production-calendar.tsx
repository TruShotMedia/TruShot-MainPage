"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TabletCalendar } from "@/components/tablet/tablet-calendar";
import { OutlookCalendarConnection } from "@/components/shared/outlook-calendar-connection";
import { OutlookEventMark } from "@/components/shared/outlook-event-mark";
import { isOutlookEvent } from "@/lib/outlook-calendar/model";
import { ProductionMobileSchedule } from "./production-mobile-schedule";
import { ProductionDayPane } from "./production-day-pane";
import { ProductionWeekPanel } from "./production-week-panel";
import { CalendarCreateMenu } from "./calendar-create-menu";
import { WorkingHoursBand, WorkingHoursLegend } from "./calendar-working-hours";
import { videographerWorkingHours } from "@/lib/calendar-working-hours";
import styles from "./production-hybrid.module.css";
import weekStyles from "./production-week-panel.module.css";
import { calendarViewStorageKey } from "@/lib/calendar-view-memory";
import { calendarWeekdayOnOrAfter, calendarWorkweek } from "@/lib/calendar-weekdays";
import { useCalendarViewMemory } from "@/components/shared/use-calendar-view-memory";
import { useProductionTeam } from "./team-context";
import { CalendarTeamColorsProvider, CalendarTeamMarker, useCalendarTeamColors } from "@/components/shared/calendar-team-colors";
import { CalendarDayTimeTools, CalendarDragButton, CalendarDropDay, CalendarEventDrag, timedBookingGeometry, type MoveCalendarEvent } from "@/components/shared/calendar-event-drag";
import { assignTeamCalendarColors, calendarTeamAttributes } from "@/lib/team-calendar-colors";
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
const DESKTOP_HOUR_HEIGHT = 64;
const brisbaneClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
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
  showWorkingHours = false,
  calendarDay = false,
  calendarWeek = false,
}: {
  data: ScheduleData;
  dates: string[];
  today: string;
  onOpen: (source: AgendaSource) => void;
  showWorkingHours?: boolean;
  calendarDay?: boolean;
  calendarWeek?: boolean;
}) {
  const calendarMembers = useCalendarTeamColors();
  const isDay = dates.length === 1;
  const [fullDay, setFullDay] = useState(false);
  const hasTimeGrid = calendarDay || calendarWeek;
  const workWindow = showWorkingHours && isDay ? videographerWorkingHours(dates[0]) : null;
  const agendas = dates.map((date) =>
    productionDayAgenda(date, {
      jobs: data.calendarJobs,
      tasks: data.calendarTasks,
      events: data.calendarEvents,
      flights: data.flightEvents,
    }),
  );
  const blocks = agendas.flatMap((day) => day.timed);
  const firstHour = hasTimeGrid && fullDay ? 0 : Math.floor(Math.min(workWindow?.start ?? 480, ...blocks.map(block => block.start)) / 60);
  const lastHour = hasTimeGrid && fullDay ? 24 : Math.min(
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
      className={`production-timetable ${isDay ? "is-day" : "is-week"}`}
      aria-label={isDay ? "Day schedule" : "Week schedule"}
    >
      <div
        className="timetable-day-labels"
        style={{
          gridTemplateColumns: `48px repeat(${dates.length},minmax(0,1fr))`,
        }}
      >
        <span>Brisbane</span>
        {dates.map((date) => (
          <strong key={date} aria-current={!isDay && date === today ? "date" : undefined}>{format(parseISO(date), "EEE d MMM")}</strong>
        ))}
      </div>
      {showWorkingHours && isDay ? <WorkingHoursLegend window={workWindow} /> : null}
      {hasTimeGrid ? <CalendarDayTimeTools week={calendarWeek} fullDay={fullDay} onToggle={() => setFullDay(value => !value)} /> : null}
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
          <CalendarDropDay key={dates[index]} date={dates[index]} targetId={`all-day:${dates[index]}`} disableDrop={calendarDay}>
            {agenda.allDay.map((item) => (
              <CalendarDragButton
                type="button"
                key={item.id}
                source={item.source}
                dragDay={calendarDay ? undefined : dates[index]}
                dragId={`all-day:${dates[index]}:${item.id}`}
                {...calendarTeamAttributes(item.source, calendarMembers)}
                className={agendaTone(item.source, today)}
                data-calendar-source={isOutlookEvent(item.source) ? "outlook" : undefined}
                onClick={() => onOpen(item.source)}
              >
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                {isOutlookEvent(item.source) ? <OutlookEventMark /> : null}
                <CalendarTeamMarker record={item.source} />
              </CalendarDragButton>
            ))}
            {!agenda.allDay.length ? (
              <span className="timetable-empty">—</span>
            ) : null}
          </CalendarDropDay>
        ))}
      </div>
      <div
        className="timetable-hours"
        style={{
          height: hours.length * DESKTOP_HOUR_HEIGHT,
          gridTemplateColumns: `48px repeat(${dates.length},minmax(0,1fr))`,
        }}
      >
        <div className="timetable-time-labels">
          {hours.map((hour) => (
            <time
              key={hour}
              style={{ top: (hour - firstHour) * DESKTOP_HOUR_HEIGHT }}
            >{`${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`}</time>
          ))}
        </div>
        {agendas.map((agenda, index) => (
          <CalendarDropDay
            key={dates[index]}
            date={dates[index]}
            targetId={`timed:${dates[index]}`}
            className="timetable-day-column"
            clockGrid={hasTimeGrid ? { firstMinute: firstHour * 60, lastMinute: lastHour * 60, hourHeight: DESKTOP_HOUR_HEIGHT, allowsDateMove: calendarWeek } : undefined}
            style={{ backgroundSize: `100% ${DESKTOP_HOUR_HEIGHT}px` }}
          >
            {workWindow ? <WorkingHoursBand window={workWindow} firstMinute={firstHour * 60} hourHeight={DESKTOP_HOUR_HEIGHT} /> : null}
            {agenda.timed.map((block) => (
              <CalendarDragButton
                key={block.id}
                source={block.source}
                dragDay={dates[index]}
                moveKind={calendarDay ? "time" : calendarWeek ? "date-time" : "date"}
                timedBooking={{ time: block.time, compact: block.end - block.start < 45, resizable: hasTimeGrid }}
                dragId={`timed:${dates[index]}:${block.id}`}
                type="button"
                {...calendarTeamAttributes(block.source, calendarMembers)}
                className={`timetable-booking ${agendaTone(block.source, today)}`}
                data-calendar-source={isOutlookEvent(block.source) ? "outlook" : undefined}
                style={
                  {
                    ...calendarTeamAttributes(block.source, calendarMembers).style,
                    ...timedBookingGeometry(block.start, block.end, firstHour * 60, DESKTOP_HOUR_HEIGHT),
                    left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / block.lanes}% - 4px)`,
                  } as CSSProperties
                }
                onClick={() => onOpen(block.source)}
                aria-label={`${block.title}, ${block.time}, ${block.detail}`}
                title={`${block.title} · ${block.time} · ${block.detail}`}
              >
                <strong>{block.title}</strong>
                {isOutlookEvent(block.source) ? <OutlookEventMark /> : null}
                <CalendarTeamMarker record={block.source} />
                {block.end - block.start >= 60 ? (
                  <span>{block.detail}</span>
                ) : null}
              </CalendarDragButton>
            ))}
          </CalendarDropDay>
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
  readOnly = false,
  onOpenItem,
  onOpenEvent,
  onOpenFlight,
  onCreate,
  onMoveEvent,
}: {
  data: ScheduleData;
  today: string;
  todayOnly?: boolean;
  mobile?: boolean;
  marketing: boolean;
  personalTools?: boolean;
  readOnly?: boolean;
  onOpenItem: (item: CalendarItem) => void;
  onOpenEvent: (event: CalendarCustomEvent) => void;
  onOpenFlight: (flight: CalendarFlightEvent) => void;
  onCreate: (kind: TabletCreateKind, date?: string) => void;
  onMoveEvent?: MoveCalendarEvent;
}) {
  const team = useProductionTeam();
  const showWorkingHours = !todayOnly && Boolean(team?.videographerId && team.userId === team.videographerId);
  const calendarMembers = useMemo(() => marketing && readOnly ? assignTeamCalendarColors(team?.members ?? []) : [], [marketing, readOnly, team?.members]);
  const memoryKey = calendarViewStorageKey(marketing ? "marketing" : "autopacific", team?.userId ?? "local",
    readOnly ? "team" : personalTools ? "mine" : "videographer", mobile);
  const [view, rememberView] = useCalendarViewMemory(todayOnly || mobile ? null : memoryKey, today, todayOnly ? "day" : "week");
  const { mode, anchor: calendarAnchor } = view;
  const date = mode === "week" ? calendarWeekdayOnOrAfter(view.date) : view.date;
  function setDate(value: string) { rememberView({ date: value }); }
  function selectDate(value: string) {
    const first = format(startOfWeek(parseISO(calendarAnchor), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const last = format(addDays(parseISO(first), 13), "yyyy-MM-dd");
    rememberView({ date: value, anchor: value < first || value > last ? value : calendarAnchor });
  }
  function changeMode(value: typeof mode) {
    let anchor = calendarAnchor;
    let selected = date;
    if (value === "hybrid" || value === "fortnight") {
      if (mode === "week" || mode === "day") anchor = date;
      else if (value === "hybrid") {
        const first = startOfWeek(parseISO(calendarAnchor), { weekStartsOn: 1 });
        if (date < format(first, "yyyy-MM-dd") || date > format(addDays(first, 13), "yyyy-MM-dd")) selected = calendarAnchor;
      }
    }
    rememberView({ mode: value, date: selected, anchor });
  }
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const currentTime = brisbaneClock.format(now);
  function open(source: AgendaSource) {
    if (source.entity_type === "calendar-event") onOpenEvent(source);
    else if (source.entity_type === "flight-event") onOpenFlight(source);
    else onOpenItem(source);
  }
  const dates = useMemo(() => mode === "week" ? calendarWorkweek(date) : [date], [mode, date]);
  const weatherLocation = marketing ? "melbourne-city" : "brisbane-city";
  const range = data.calendarJobs.filter(
    (job) => job.status_label.toLowerCase() !== "planning",
  );
  const schedule = { ...data, calendarJobs: range };
  const productionTools = !marketing || personalTools;
  const moveEvent = !todayOnly && !readOnly ? onMoveEvent : undefined;
  if (mobile) return <CalendarTeamColorsProvider value={calendarMembers}><ProductionMobileSchedule memoryKey={memoryKey} data={schedule} today={today} todayOnly={todayOnly} marketing={marketing} onOpen={open} onMoveEvent={moveEvent} currentTime={currentTime} showWorkingHours={showWorkingHours}
    renderCreateButton={readOnly ? undefined : value => <CalendarCreateMenu key={value} date={value} productionTools={productionTools} onCreate={onCreate} />} /></CalendarTeamColorsProvider>;
  return (
    <CalendarTeamColorsProvider value={calendarMembers}>
    <div className="production-calendar-workspace">
      <CalendarEventDrag onMove={moveEvent}>
      <div className="production-calendar-views">
        {!marketing && !todayOnly ? <OutlookCalendarConnection /> : null}
        <div className="apg-view-pills" aria-label="Schedule view">
          {(!todayOnly ? ["fortnight", "week", "day", "hybrid"] : ["day"]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => changeMode(key as typeof mode)}
            >
              {key === "fortnight"
                ? "Fortnight"
                : key[0].toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
        {mode !== "fortnight" && mode !== "hybrid" ? (
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
        {!readOnly ? <CalendarCreateMenu key={date} date={date} label="Add" productionTools={productionTools} onCreate={onCreate} /> : null}
      </div>
      {moveEvent && (mode === "fortnight" || mode === "hybrid") ? <p className="calendar-move-help">Drag a calendar event onto another day to move it. Its booked time stays the same.</p> : null}
      {mode === "fortnight" || mode === "hybrid" ? (
        <div className={mode === "hybrid" ? styles.layout : styles.body} aria-label={mode === "hybrid" ? "Hybrid calendar" : undefined}>
        <TabletCalendar
          anchorDate={calendarAnchor}
          onAnchorDateChange={(value) => rememberView({ anchor: value, date: value })}
          selectedDate={mode === "hybrid" ? date : undefined}
          onSelectDate={mode === "hybrid" ? selectDate : undefined}
          currentTime={currentTime}
          weatherLocationKey={weatherLocation}
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
          editable={!readOnly}
          onCreateEvent={(date) => onCreate("event", date)}
          renderCreateButton={value => <CalendarCreateMenu date={value} productionTools={productionTools} className="tablet-calendar-day-add" onCreate={onCreate} />}
          onEditItem={onOpenItem}
          onEditEvent={onOpenEvent}
          onEditFlight={onOpenFlight}
          today={today}
        />
        {mode === "hybrid" ? <ProductionDayPane data={schedule} date={date} today={today} currentTime={currentTime} onSelectDate={selectDate} onOpen={open} /> : null}
        </div>
      ) : mode === "week" ? (
        <section className={weekStyles.layout} aria-label="Production calendar">
          <TimedSchedule data={schedule} dates={dates} today={today} onOpen={open} calendarWeek />
          <ProductionWeekPanel jobs={data.calendarJobs} tasks={data.calendarTasks} today={today} currentTime={currentTime}
            selected={date} weekDates={dates} location={weatherLocation} onOpenItem={onOpenItem} onSelect={setDate} />
        </section>
      ) : (
        <TimedSchedule
          data={schedule}
          dates={dates}
          today={today}
          showWorkingHours={showWorkingHours}
          calendarDay={!todayOnly}
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
                {...calendarTeamAttributes(item, calendarMembers)}
                className={agendaTone(item, today)}
                onClick={() => onOpenItem(item)}
              >
                <strong>{item.title}</strong>
                <CalendarTeamMarker record={item} />
                <span>
                  {item.due_date === today
                    ? "Due today"
                    : `Overdue · ${format(parseISO(item.due_date!), "d MMM")}`}
                </span>
              </button>
            ))}
        </section>
      ) : null}
      </CalendarEventDrag>
      {marketing && !personalTools ? (
        <p className="brief-help">
          Tasks and flights are visible for planning. Task editing and flight
          creation stay with production.
        </p>
      ) : null}
    </div>
    </CalendarTeamColorsProvider>
  );
}
