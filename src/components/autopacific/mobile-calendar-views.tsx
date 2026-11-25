"use client";

import { useState, type CSSProperties } from "react";
import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, ChevronRight, Clock3 } from "lucide-react";
import {
  CalendarDayTimeTools, CalendarDragButton, CalendarDropDay,
} from "@/components/shared/calendar-event-drag";
import { CalendarTeamMarker, useCalendarTeamColors } from "@/components/shared/calendar-team-colors";
import { WeatherIcon } from "@/components/shared/calendar-weather";
import { OutlookEventMark } from "@/components/shared/outlook-event-mark";
import { isOutlookEvent } from "@/lib/outlook-calendar/model";
import { calendarTeamAttributes } from "@/lib/team-calendar-colors";
import { mobileScheduleTone } from "@/lib/mobile-fortnight-calendar";
import { mobileHourLayout } from "@/lib/mobile-calendar-period";
import { videographerWorkingHours } from "@/lib/calendar-working-hours";
import { WorkingHoursBand, WorkingHoursLegend } from "./calendar-working-hours";
import { WEATHER_LOCATIONS, type SavedCalendarWeather } from "@/lib/calendar-weather";
import type { AgendaSource, TimedBlock } from "@/lib/production-agenda";
import type { productionSelectedDay } from "@/lib/production-selected-day";

type Agenda = ReturnType<typeof productionSelectedDay>;
type Item = Agenda["allDay"][number] | TimedBlock;
type Open = (item: AgendaSource) => void;
type OpenWeather = (day: SavedCalendarWeather) => void;
const emptyAgenda: Agenda = { allDay: [], timed: [] };

export function MobileForecast({ forecast, onOpen }: { forecast?: SavedCalendarWeather; onOpen: OpenWeather }) {
  if (!forecast) return null;
  const { temperatureMax: high, temperatureMin: low, condition } = forecast;
  return <button type="button" className={`mobile-calendar-forecast weather-${condition}`}
    aria-label={`${WEATHER_LOCATIONS[forecast.location_key].name} forecast for ${format(parseISO(forecast.date), "d MMMM")}: ${forecast.summary}, high ${high}, low ${low} degrees`}
    onClick={() => onOpen(forecast)}>
    <WeatherIcon condition={condition} size={17} /><span><b>{high}°</b> <span>{low}°</span></span>
  </button>;
}

function itemTime(item: Item) {
  if ("time" in item) return item.time;
  if (item.id.startsWith("ongoing:") || item.id.startsWith("trip:")) return "Ongoing";
  if (item.detail.includes("deadline")) return item.detail.split(" · ")[1] ?? "Due";
  if (item.detail.includes("time not set")) return "Untimed";
  return "All day";
}

function MobileCalendarCard({ date, item, today, onOpen, variant = "row", drag = true, style }: {
  date: string; item: Item; today: string; onOpen: Open; variant?: "row" | "tile" | "hour"; drag?: boolean; style?: CSSProperties;
}) {
  const members = useCalendarTeamColors();
  const source = item.source;
  const team = calendarTeamAttributes(source, members);
  const outlook = isOutlookEvent(source);
  const time = itemTime(item);
  const showDetail = variant === "row" && item.detail !== time;
  return <CalendarDragButton type="button" source={source} dragDay={drag ? date : undefined} moveKind={variant === "hour" ? "time" : "date"}
    dragId={`phone:${variant}:${date}:${item.id}`}
    className={`mobile-calendar-card is-${variant} ${mobileScheduleTone(source, today)} ${variant === "hour" ? "mobile-calendar-hour-block" : ""}`}
    {...team} style={{ ...team.style, ...style }} data-kind={source.entity_type} data-calendar-source={outlook ? "outlook" : undefined}
    aria-label={`${item.title}, ${time}, ${item.detail}${outlook ? ", Outlook, read only" : ""}`}
    onClick={() => onOpen(source)}>
    <span className="mobile-calendar-card-time">{time}</span>
    <span className="mobile-calendar-card-copy"><strong>{item.title}</strong>{showDetail ? <small>{item.detail}</small> : null}</span>
    <CalendarTeamMarker record={source} />
    {outlook ? <OutlookEventMark /> : variant === "row" ? <ChevronRight className="mobile-calendar-card-arrow" size={15} aria-hidden="true" /> : null}
  </CalendarDragButton>;
}

export function MobileCalendarOverview({ mode, dates, agendas, forecasts, today, selected, onSelect, onOpen, onWeather }: {
  mode: "week" | "list"; dates: string[]; agendas: ReadonlyMap<string, Agenda>; forecasts: ReadonlyMap<string, SavedCalendarWeather>;
  today: string; selected: string; onSelect: (date: string) => void; onOpen: Open; onWeather: OpenWeather;
}) {
  const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
  const week = mode === "week";
  return <section className={`mobile-calendar-overview is-${mode}`} aria-label={week ? "Weekly calendar" : "Calendar list"}>
    {dates.map(date => {
      const day = parseISO(date);
      const agenda = agendas.get(date) ?? emptyAgenda;
      const items = [...agenda.allDay, ...agenda.timed];
      return <CalendarDropDay date={date} data-date={date} key={date} role="group" aria-label={`${format(day, "EEEE d MMMM")} bookings`}
        className={`mobile-calendar-overview-day ${date === today ? "is-today" : ""} ${date === selected ? "is-selected" : ""}`}>
        <header className="mobile-calendar-overview-date">
          <button type="button" aria-label={format(day, "EEEE d MMMM")} aria-current={date === today ? "date" : undefined} onClick={() => onSelect(date)}>
            {week ? <><span>{format(day, "EEE")}</span><strong>{format(day, "d")}</strong></>
              : <><strong>{date === today ? "Today" : date === tomorrow ? "Tomorrow" : format(day, "EEEE")}</strong><span>{format(day, "d MMM")}</span></>}
          </button>
          <MobileForecast forecast={forecasts.get(date)} onOpen={onWeather} />
        </header>
        <div className="mobile-calendar-overview-items">
          {items.length ? items.map(item => <MobileCalendarCard key={item.id} date={date} item={item} today={today}
            onOpen={onOpen} variant={week ? "tile" : "row"} />) : <p className="mobile-calendar-free">No bookings</p>}
        </div>
      </CalendarDropDay>;
    })}
  </section>;
}

function MobileHourGrid({ agenda, date, today, currentTime, showWorkingHours, onOpen }: {
  agenda: Agenda; date: string; today: string; currentTime?: string; showWorkingHours?: boolean; onOpen: Open;
}) {
  const [fullDay, setFullDay] = useState(false);
  const now = date === today && currentTime ? Number(currentTime.slice(0, 2)) * 60 + Number(currentTime.slice(3, 5)) : null;
  const layout = mobileHourLayout(agenda.timed, now, fullDay);
  const workWindow = showWorkingHours ? videographerWorkingHours(date) : null;
  const hint = [layout.lanes > 2 ? "Swipe for more" : null, !showWorkingHours ? "Brisbane time" : null].filter(Boolean).join(" · ");
  return <section className="mobile-calendar-hour-section" aria-label="Hourly schedule">
    <div className="mobile-calendar-section-heading"><h3><Clock3 size={14} /> Hourly schedule</h3>{hint ? <span>{hint}</span> : null}</div>
    <div className="mobile-calendar-hour-scroll">
      {showWorkingHours ? <WorkingHoursLegend window={workWindow} /> : null}
      <CalendarDayTimeTools mobile fullDay={fullDay} onToggle={() => setFullDay(value => !value)} />
      <div className="mobile-calendar-hour-grid" style={{ minWidth: 48 + layout.lanes * 105, height: layout.height + 12 }}>
        {layout.hours.map((hour, index) => <div key={hour} className="mobile-calendar-hour-line" style={{ top: index * 60 }} aria-hidden="true">
          <span>{hour % 12 || 12}{hour < 12 ? " AM" : " PM"}</span>
        </div>)}
        <CalendarDropDay date={date} targetId={`phone-timed:${date}`} className="mobile-calendar-hour-events"
          clockGrid={{ firstMinute: layout.firstMinute, lastMinute: layout.lastMinute, hourHeight: 60 }}>
          {workWindow ? <WorkingHoursBand window={workWindow} firstMinute={layout.firstMinute} hourHeight={60} /> : null}
          {layout.blocks.map(item => <MobileCalendarCard key={item.id} date={date} today={today} item={item} onOpen={onOpen} variant="hour"
            style={{ top: item.start - layout.firstMinute, height: item.end - item.start - 3,
              left: `calc(${item.lane / item.lanes * 100}% + 2px)`, width: `calc(${100 / item.lanes}% - 4px)` }} />)}
        </CalendarDropDay>
        {now !== null ? <div className="mobile-calendar-current-time" style={{ top: now - layout.firstMinute }}>
          <time aria-label={`Current time in Brisbane: ${currentTime}`}>{currentTime}</time>
        </div> : null}
      </div>
    </div>
  </section>;
}

export function MobileSelectedAgenda({ agenda, date, today, currentTime, hourly, showWorkingHours, onOpen }: {
  agenda: Agenda; date: string; today: string; currentTime?: string; hourly: boolean; showWorkingHours?: boolean; onOpen: Open;
}) {
  return <>
    {agenda.allDay.length ? <section className="apg-mobile-all-day mobile-calendar-group" aria-label="All-day items">
      <h3><CalendarDays size={14} /> All day & deadlines</h3>
      {agenda.allDay.map(item => <MobileCalendarCard key={item.id} date={date} today={today} item={item} onOpen={onOpen} drag={!hourly} />)}
    </section> : null}
    {hourly ? <MobileHourGrid agenda={agenda} date={date} today={today} currentTime={currentTime} showWorkingHours={showWorkingHours} onOpen={onOpen} />
      : <section className="apg-mobile-timeline mobile-calendar-group" aria-label="Timed bookings">
        <h3><Clock3 size={14} /> Booked times</h3>
        {agenda.timed.length ? agenda.timed.map(item => <MobileCalendarCard key={item.id} date={date} today={today} item={item} onOpen={onOpen} />)
          : <p className="mobile-calendar-free">{agenda.allDay.length ? "No timed bookings" : "Nothing booked for this day"}</p>}
      </section>}
  </>;
}
