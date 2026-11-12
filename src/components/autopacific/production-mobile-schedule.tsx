"use client";

import { useState, type ReactNode } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plane, Plus } from "lucide-react";
import type { AgendaSource } from "@/lib/production-agenda";
import { productionSelectedDay, type ProductionScheduleData } from "@/lib/production-selected-day";
import { OutlookCalendarConnection } from "@/components/shared/outlook-calendar-connection";
import { OutlookEventMark } from "@/components/shared/outlook-event-mark";
import { isOutlookEvent } from "@/lib/outlook-calendar/model";
import { CalendarWeatherBadge, CalendarWeatherCredit, CalendarWeatherDetails, useCalendarWeather } from "@/components/shared/calendar-weather";
import type { SavedCalendarWeather } from "@/lib/calendar-weather";
import styles from "./production-hybrid.module.css";
import { useCalendarViewMemory } from "@/components/shared/use-calendar-view-memory";

type Data = ProductionScheduleData;
function tone(item: AgendaSource, today: string) {
  if ((item.client_name ?? "").toLowerCase() !== "autopacific group") return "is-unrelated";
  if ("delay_info" in item && (item.delay_info?.delayed_from || item.delay_info?.delayed_to)) return "is-delayed";
  if ("is_complete" in item && item.is_complete) return "is-complete";
  if (item.entity_type === "calendar-event" && item.end_date < today || item.entity_type === "flight-event" && item.arrival_date < today) return "is-complete";
  if ("due_date" in item && item.due_date && item.due_date < today) return "is-overdue";
  return "is-autopacific";
}

export function ProductionMobileSchedule({ data, today, todayOnly, marketing, memoryKey, onOpen: onOpenRecord, onCreate, renderCreateButton }: { data: Data; today: string; todayOnly: boolean; marketing: boolean; memoryKey?: string; onOpen: (item: AgendaSource) => void; onCreate?: (date: string) => void; renderCreateButton?: (date: string) => ReactNode }) {
  const [view, rememberView] = useCalendarViewMemory(todayOnly ? null : memoryKey ?? null, today, todayOnly ? "day" : "week");
  const { mode: period, anchor, date: selected } = view;
  function setSelected(date: string) { rememberView({ date }); }
  const [weatherDay, setWeatherDay] = useState<SavedCalendarWeather | null>(null);
  const length = todayOnly || period === "day" ? 1 : period === "week" ? 7 : 14;
  const first = length === 1 ? parseISO(anchor) : startOfWeek(parseISO(anchor), { weekStartsOn: 1 });
  const dates = Array.from({ length }, (_, index) => format(addDays(first, index), "yyyy-MM-dd"));
  const location = marketing ? "melbourne-city" : "brisbane-city";
  const weather = useCalendarWeather(dates[0], dates.at(-1)!, location);
  const agenda = productionSelectedDay(selected, data);
  function onOpen(source: AgendaSource) {
    // Combined itineraries are display-only; editors always receive an original leg.
    onOpenRecord(source.entity_type === "flight-event" ? data.flightEvents.find(flight => flight.id === source.id) ?? source : source);
  }
  const overdue = [...data.calendarJobs, ...data.calendarTasks].filter(item => !item.is_complete && item.due_date && item.due_date < today);
  function move(days: number) { const next = format(addDays(parseISO(anchor), days), "yyyy-MM-dd"); rememberView({ anchor: next, date: next }); }
  function changePeriod(value: typeof period) { rememberView({ mode: value, anchor: selected }); }
  return <div className="apg-mobile-schedule" aria-label={todayOnly ? "Today agenda" : "Mobile calendar"}>
    {!todayOnly ? <>
      <div className={`apg-view-pills ${styles.viewPills}`} aria-label="Schedule view">{(["fortnight", "week", "day", "hybrid"] as const).map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => changePeriod(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <div className="apg-mobile-period"><button type="button" aria-label="Previous schedule period" onClick={() => move(-length)}><ChevronLeft size={19} /></button><strong>{format(first, "d MMM")}{length > 1 ? ` – ${format(addDays(first, length - 1), "d MMM")}` : ""}</strong><button type="button" aria-label="Next schedule period" onClick={() => move(length)}><ChevronRight size={19} /></button><button type="button" onClick={() => rememberView({ anchor: today, date: today })}>Today</button></div>
      {length > 1 ? <div className="apg-mobile-date-strip" aria-label="Select a calendar day">{dates.map(date => <button type="button" key={date} aria-pressed={selected === date} aria-label={format(parseISO(date), "EEEE d MMMM")} className={date === today ? "is-today" : ""} onClick={() => setSelected(date)}><small>{format(parseISO(date), "EEE")}</small><strong>{format(parseISO(date), "d")}</strong>{date === today ? <i aria-hidden="true" /> : null}</button>)}</div> : null}
    </> : null}
    <header className="apg-mobile-agenda-heading">
      <div><span>{selected === today ? "Your day, in focus" : "Daily schedule"}</span><h2>{format(parseISO(selected), "EEEE, d MMM")}</h2></div>
      <CalendarWeatherBadge day={weather.days.find(day => day.date === selected)} onOpen={setWeatherDay} />
      {!marketing && !todayOnly ? <OutlookCalendarConnection compact /> : null}
      {renderCreateButton ? renderCreateButton(selected) : onCreate ? <button type="button" aria-label={`Add event on ${selected}`} onClick={() => onCreate(selected)}><Plus size={19} /></button> : null}
    </header>
    {agenda.allDay.length ? <section className="apg-mobile-all-day" aria-label="All-day items"><h3><CalendarDays size={14} /> All day & deadlines</h3>{agenda.allDay.map(item => <button key={item.id} type="button" className={tone(item.source, today)} data-calendar-source={isOutlookEvent(item.source) ? "outlook" : undefined} onClick={() => onOpen(item.source)}><strong>{item.title}</strong><small>{item.detail}</small>{isOutlookEvent(item.source) ? <OutlookEventMark /> : <ChevronRight size={16} />}</button>)}</section> : null}
    <section className="apg-mobile-timeline" aria-label="Timed bookings"><h3><Clock3 size={14} /> Booked times</h3>{agenda.timed.map(item => <article key={item.id}><time>{item.time}</time><button type="button" className={tone(item.source, today)} data-calendar-source={isOutlookEvent(item.source) ? "outlook" : undefined} onClick={() => onOpen(item.source)}>{item.source.entity_type === "flight-event" ? <Plane size={17} /> : <CalendarDays size={17} />}<span><strong>{item.title}</strong><small>{item.detail}</small></span>{isOutlookEvent(item.source) ? <OutlookEventMark /> : <ChevronRight size={16} />}</button></article>)}{!agenda.timed.length ? <p className="apg-mobile-free-time">{agenda.allDay.length ? "No timed bookings. Your all-day items are above." : "A little breathing room. Nothing booked for this day."}</p> : null}</section>
    {todayOnly && overdue.length ? <section className="apg-mobile-all-day" aria-label="Overdue work"><h3>Still needs attention</h3>{overdue.map(item => <button key={`${item.entity_type}:${item.id}`} type="button" className="is-overdue" onClick={() => onOpen(item)}><strong>{item.title}</strong><small>Due {format(parseISO(item.due_date!), "d MMM")}</small><ChevronRight size={16} /></button>)}</section> : null}
    <CalendarWeatherCredit unavailable={weather.unavailable} locationKey={location} />
    {weatherDay ? <CalendarWeatherDetails day={weatherDay} onClose={() => setWeatherDay(null)} /> : null}
  </div>;
}
