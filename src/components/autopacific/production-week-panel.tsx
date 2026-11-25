"use client";

import { useMemo, useState } from "react";
import { addMonths, format, parseISO } from "date-fns";
import { Briefcase, Check, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { CalendarWeatherCredit, CalendarWeatherDetails, useCalendarWeather, WeatherIcon } from "@/components/shared/calendar-weather";
import { CalendarTeamMarker, useCalendarTeamColors } from "@/components/shared/calendar-team-colors";
import { calendarTeamAttributes } from "@/lib/team-calendar-colors";
import { workingHoursTime } from "@/lib/calendar-working-hours";
import { calendarWeekdayMonth } from "@/lib/calendar-weekdays";
import { WEATHER_LOCATIONS, type WeatherLocationKey } from "@/lib/calendar-weather";
import type { CalendarItem, CalendarJob, CalendarTask } from "@/lib/types";
import styles from "./production-week-panel.module.css";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function clockLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return workingHoursTime(hour * 60 + minute);
}

function MiniMonth({ selected, today, weekDates, onSelect }: {
  selected: string; today: string; weekDates: readonly string[]; onSelect: (day: string) => void;
}) {
  const anchorMonth = selected.slice(0, 7);
  const [browse, setBrowse] = useState<{ anchor: string; month: string } | null>(null);
  const month = browse?.anchor === anchorMonth ? browse.month : anchorMonth;
  const first = useMemo(() => parseISO(`${month}-01`), [month]);
  const days = useMemo(() => calendarWeekdayMonth(`${month}-01`), [month]);
  function step(amount: -1 | 1) {
    setBrowse({ anchor: anchorMonth, month: format(addMonths(first, amount), "yyyy-MM") });
  }
  return <section className={styles.card} aria-label="Mini month calendar">
    <div className={styles.monthHeader}>
      <button type="button" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
      <h3 aria-live="polite">{format(first, "MMMM yyyy")}</h3>
      <button type="button" aria-label="Next month" onClick={() => step(1)}><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    <div className={styles.monthGrid}>
      {weekdays.map(day => <span key={day} className={styles.weekday} aria-hidden="true">{day}</span>)}
      {days.map(date => <button key={date} type="button" className={styles.date}
        data-outside={date.slice(0, 7) !== month || undefined}
        data-in-week={weekDates.includes(date) || undefined}
        aria-pressed={date === selected}
        aria-current={date === today ? "date" : undefined}
        aria-label={format(parseISO(date), "EEEE d MMMM yyyy")}
        onClick={() => { setBrowse(null); onSelect(date); }}>
        <time dateTime={date}>{Number(date.slice(-2))}</time>
      </button>)}
    </div>
  </section>;
}

export function ProductionWeekPanel({ jobs, tasks, today, currentTime, selected, weekDates, location, onOpenItem, onSelect }: {
  jobs: CalendarJob[]; tasks: CalendarTask[]; today: string; currentTime: string; selected: string; weekDates: readonly string[];
  location: WeatherLocationKey; onOpenItem: (item: CalendarItem) => void; onSelect: (date: string) => void;
}) {
  const members = useCalendarTeamColors();
  const forecast = useCalendarWeather(today, today, location);
  const day = forecast.days.find(item => item.date === today);
  const [openedForecast, setOpenedForecast] = useState<string | null>(null);
  const due = useMemo(() => [...jobs, ...tasks].filter(item => item.due_date === today)
    .sort((a, b) => Number(a.is_complete) - Number(b.is_complete)
      || (a.due_time ?? "24:00").localeCompare(b.due_time ?? "24:00") || a.title.localeCompare(b.title)), [jobs, tasks, today]);
  return <aside className={styles.panel} aria-label="Today at a glance">
    <section className={`${styles.card} ${styles.today}`} aria-label="Current time and today's weather">
      <header className={styles.todayHeader}>
        <span>Today · {format(parseISO(today), "EEE d MMM")}</span>
        <strong><time aria-label="Current Brisbane time" dateTime={currentTime} suppressHydrationWarning>{clockLabel(currentTime)}</time></strong>
        <small>Brisbane time</small>
      </header>
      {day ? <button type="button" className={styles.weather}
        aria-label={`Today's forecast in ${WEATHER_LOCATIONS[location].label}: ${day.summary}, ${day.temperatureMin} to ${day.temperatureMax} degrees`}
        onClick={() => setOpenedForecast(day.date)}>
        <span className={styles.weatherIcon}><WeatherIcon condition={day.condition} size={25} /></span>
        <span><strong>{day.temperatureMax}° <small>/ {day.temperatureMin}°</small></strong><span>{day.summary}</span></span>
        <ChevronRight size={15} aria-hidden="true" />
      </button> : <p className={styles.empty}>{forecast.unavailable ? "Weather is temporarily unavailable." : "No forecast for today."}</p>}
      <CalendarWeatherCredit unavailable={forecast.unavailable} locationKey={location} />
    </section>
    <section className={`${styles.card} ${styles.deadlines}`} aria-label="Jobs and tasks due today">
      <header className={styles.deadlineHeader}><h3>Due today</h3><span>{due.length}</span></header>
      {due.length ? <ul className={styles.dueList} aria-label="Today's deadlines">{due.map(item => {
        const Icon = item.is_complete ? Check : item.entity_type === "job" ? Briefcase : Flag;
        return <li key={`${item.entity_type}:${item.id}`}><button type="button" className={styles.dueItem} data-tone={item.is_complete ? "complete" : undefined}
          {...calendarTeamAttributes(item, members)} onClick={() => onOpenItem(item)}>
          <Icon size={15} aria-hidden="true" />
          <span><strong>{item.title}</strong><small>{item.entity_type === "job" ? "Job" : "Task"}{item.due_time ? ` · ${clockLabel(item.due_time)}` : ""}{item.is_complete ? " · Done" : ""}</small></span>
          <CalendarTeamMarker record={item} /><ChevronRight size={13} aria-hidden="true" />
        </button></li>;
      })}</ul> : <p className={styles.empty}>No jobs or tasks due today.</p>}
    </section>
    <MiniMonth selected={selected} today={today} weekDates={weekDates} onSelect={onSelect} />
    {day && openedForecast === day.date ? <CalendarWeatherDetails day={day} onClose={() => setOpenedForecast(null)} /> : null}
  </aside>;
}
