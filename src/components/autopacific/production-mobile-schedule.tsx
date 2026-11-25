"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { AgendaSource } from "@/lib/production-agenda";
import { createProductionDayProjection, type ProductionScheduleData } from "@/lib/production-selected-day";
import { mobileCalendarModes, type MobileCalendarViewMode } from "@/lib/calendar-view-memory";
import { adjacentMobileCalendarAnchor, mobileCalendarDates, mobileCalendarPeriodTitle, mobileWeekdayOnOrAfter } from "@/lib/mobile-calendar-period";
import { OutlookCalendarConnection } from "@/components/shared/outlook-calendar-connection";
import { CalendarWeatherCredit, CalendarWeatherDetails, useCalendarWeather } from "@/components/shared/calendar-weather";
import type { SavedCalendarWeather } from "@/lib/calendar-weather";
import { CalendarTeamMarker, useCalendarTeamColors } from "@/components/shared/calendar-team-colors";
import { calendarTeamAttributes } from "@/lib/team-calendar-colors";
import { CalendarEventDrag, type MoveCalendarEvent } from "@/components/shared/calendar-event-drag";
import { useCalendarViewMemory } from "@/components/shared/use-calendar-view-memory";
import { MobileFortnightCalendar } from "./mobile-fortnight-calendar";
import { MobileCalendarOverview, MobileForecast, MobileSelectedAgenda } from "./mobile-calendar-views";
import "./mobile-calendar.css";

const titles = { list: "List", day: "Day", week: "Week", fortnight: "Fortnight", month: "Month" };

export function ProductionMobileSchedule({
  data, today, todayOnly, marketing, memoryKey, currentTime, showWorkingHours, onOpen: onOpenRecord, onCreate, renderCreateButton, onMoveEvent,
}: {
  data: ProductionScheduleData; today: string; todayOnly: boolean; marketing: boolean; memoryKey?: string; currentTime?: string;
  onOpen: (item: AgendaSource) => void; onCreate?: (date: string) => void;
  renderCreateButton?: (date: string) => ReactNode; onMoveEvent?: MoveCalendarEvent;
  showWorkingHours?: boolean;
}) {
  const calendarMembers = useCalendarTeamColors();
  const [view, rememberView] = useCalendarViewMemory(todayOnly ? null : memoryKey ?? null, today, todayOnly ? "day" : "fortnight", mobileCalendarModes);
  const mode = todayOnly ? "day" : mobileCalendarModes.find(value => value === view.mode) ?? "fortnight";
  const anchor = mode === "month" ? view.anchor : mobileWeekdayOnOrAfter(view.anchor);
  const nextWeekday = mobileWeekdayOnOrAfter(today);
  const [weatherDay, setWeatherDay] = useState<SavedCalendarWeather | null>(null);
  const agendaHeading = useRef<HTMLElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => todayOnly ? [today] : mobileCalendarDates(anchor, mode), [anchor, mode, today, todayOnly]);
  const preferred = todayOnly ? today : mobileWeekdayOnOrAfter(view.date);
  const selected = mode === "day" ? dates[0] : dates.includes(preferred) ? preferred
    : preferred > dates[dates.length - 1] ? dates[dates.length - 1] : dates[0];
  const location = marketing ? "melbourne-city" : "brisbane-city";
  const weather = useCalendarWeather(dates[0], dates[dates.length - 1], location);
  const forecasts = useMemo(() => new Map(weather.days.map(item => [item.date, item])), [weather.days]);
  const projectDay = useMemo(() => createProductionDayProjection(data), [data]);
  const overview = mode === "week" || mode === "list";
  const agendas = useMemo(() => new Map((overview ? dates : [selected]).map(date => [date, projectDay(date)])), [dates, overview, projectDay, selected]);

  function openRecord(source: AgendaSource) {
    // Combined itineraries are display-only; editors always receive an original leg.
    onOpenRecord(source.entity_type === "flight-event" ? data.flightEvents.find(flight => flight.id === source.id) ?? source : source);
  }
  function scrollToTop() {
    calendar.current?.closest(".apg-desktop-main")?.scrollTo?.({ top: 0 });
  }
  function navigate(direction: -1 | 1) {
    const next = adjacentMobileCalendarAnchor(anchor, mode, direction);
    rememberView({ anchor: next, date: next });
    scrollToTop();
  }
  function changeMode(next: MobileCalendarViewMode) {
    if (next === mode) return;
    rememberView({ mode: next, anchor: selected, date: selected });
    scrollToTop();
  }
  function selectDay(date: string) {
    rememberView({ date });
    if (mode === "month") requestAnimationFrame(() => agendaHeading.current?.scrollIntoView?.({ block: "nearest" }));
  }
  function openDay(date: string) {
    rememberView({ mode: "day", anchor: date, date });
    scrollToTop();
  }
  const moveEvent: MoveCalendarEvent | undefined = !todayOnly && mode !== "day" && onMoveEvent ? async change => {
    const result = await onMoveEvent(change);
    if (result.ok) rememberView({ date: change.to });
    return result;
  } : undefined;

  const overdue = todayOnly ? [...data.calendarJobs, ...data.calendarTasks].filter(item => !item.is_complete && item.due_date && item.due_date < today) : [];
  const create = renderCreateButton ? renderCreateButton(selected) : onCreate
    ? <button className="mobile-calendar-create" type="button" aria-label={`Add event on ${selected}`} onClick={() => onCreate(selected)}><Plus size={20} aria-hidden="true" /></button> : null;
  return <div ref={calendar} className="apg-mobile-schedule" aria-label={todayOnly ? "Today agenda" : "Mobile calendar"}>
    <CalendarEventDrag onMove={moveEvent}>
      {!todayOnly ? <div className="mobile-calendar-controls">
        <div className="mobile-calendar-modes" role="group" aria-label="Schedule view">
          {mobileCalendarModes.map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => changeMode(value)}>{titles[value]}</button>)}
        </div>
        <div className="apg-mobile-period">
          <strong>{mobileCalendarPeriodTitle(dates, anchor, mode)}</strong>
          <div className="mobile-calendar-period-actions">
            <button type="button" aria-label={nextWeekday === today ? undefined : "Go to next weekday"} onClick={() => { rememberView({ anchor: nextWeekday, date: nextWeekday }); scrollToTop(); }}>{nextWeekday === today ? "Today" : "Next weekday"}</button>
            <button type="button" aria-label="Previous schedule period" onClick={() => navigate(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
            <button type="button" aria-label="Next schedule period" onClick={() => navigate(1)}><ChevronRight size={18} aria-hidden="true" /></button>
            {create}
          </div>
        </div>
      </div> : null}
      {mode === "month" || mode === "fortnight" ? <MobileFortnightCalendar mode={mode} data={data} anchor={anchor} selected={selected} today={today} weather={weather.days} onSelectDate={selectDay} /> : null}
      {mode === "week" || mode === "list" ? <MobileCalendarOverview mode={mode} dates={dates} agendas={agendas} forecasts={forecasts} today={today} selected={selected}
        onSelect={openDay} onOpen={openRecord} onWeather={setWeatherDay} /> : <>
        <header className="apg-mobile-agenda-heading" ref={agendaHeading}>
          <div><span>{selected === today ? "Today" : "Selected day"}</span><h2>{format(parseISO(selected), "EEEE, d MMM")}</h2></div>
          <MobileForecast forecast={forecasts.get(selected)} onOpen={setWeatherDay} />
          {todayOnly ? create : null}
        </header>
        <MobileSelectedAgenda agenda={agendas.get(selected)!} date={selected} today={today} currentTime={currentTime} hourly={mode === "day" && !todayOnly} showWorkingHours={showWorkingHours} onOpen={openRecord} />
      </>}
      {overdue.length ? <section className="apg-mobile-all-day mobile-calendar-group" aria-label="Overdue work">
        <h3>Still needs attention</h3>{overdue.map(item => <button key={`${item.entity_type}:${item.id}`} type="button" className="mobile-calendar-card is-row is-overdue" {...calendarTeamAttributes(item, calendarMembers)} onClick={() => openRecord(item)}>
          <span className="mobile-calendar-card-time">Overdue</span><span className="mobile-calendar-card-copy"><strong>{item.title}</strong><small>Due {format(parseISO(item.due_date!), "d MMM")}</small></span>
          <CalendarTeamMarker record={item} /><ChevronRight size={15} aria-hidden="true" />
        </button>)}
      </section> : null}
      <footer className="mobile-calendar-footer">
        <CalendarWeatherCredit unavailable={weather.unavailable} locationKey={location} />
        {!marketing && !todayOnly ? <OutlookCalendarConnection compact /> : null}
      </footer>
      {weatherDay ? <CalendarWeatherDetails day={weatherDay} onClose={() => setWeatherDay(null)} /> : null}
    </CalendarEventDrag>
  </div>;
}
