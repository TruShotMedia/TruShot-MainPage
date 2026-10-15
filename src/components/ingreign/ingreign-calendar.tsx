"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Flame, ImagePlus } from "lucide-react";
import { buildRecurringIngreignMarkers, formatIngreignDate, manualEventToMarker, type IngreignManualEvent } from "@/lib/ingreign";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function generatorHref(marker: ReturnType<typeof buildRecurringIngreignMarkers>[number]) {
  return `/ingreign/generator?${new URLSearchParams({
    date: marker.date,
    event: marker.eventDate,
    preset: marker.presetKey,
    marker: marker.id,
  })}`;
}

export function IngreignCalendar({ manualEvents }: { manualEvents: IngreignManualEvent[] }) {
  const today = todayKey();
  const currentDate = new Date(`${today}T00:00:00Z`);
  const [month, setMonth] = useState(currentDate.getUTCMonth());
  const [year, setYear] = useState(currentDate.getUTCFullYear());
  const markers = useMemo(() => [
    ...buildRecurringIngreignMarkers(year),
    ...manualEvents.filter((event) => Number(event.event_date.slice(0, 4)) === year).map(manualEventToMarker),
  ].sort((left, right) => left.date.localeCompare(right.date)), [manualEvents, year]);
  const markersByDate = useMemo(() => {
    const map = new Map<string, typeof markers>();
    for (const marker of markers) map.set(marker.date, [...(map.get(marker.date) ?? []), marker]);
    return map;
  }, [markers]);

  const first = new Date(Date.UTC(year, month, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((mondayOffset + totalDays) / 7) * 7 }, (_, index) => {
    const day = index - mondayOffset + 1;
    return day > 0 && day <= totalDays ? day : null;
  });
  const upcoming = [...buildRecurringIngreignMarkers(currentDate.getUTCFullYear()), ...buildRecurringIngreignMarkers(currentDate.getUTCFullYear() + 1), ...manualEvents.map(manualEventToMarker)]
    .filter((marker) => marker.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 5);

  function moveMonth(direction: number) {
    const date = new Date(Date.UTC(year, month + direction, 1));
    setYear(date.getUTCFullYear());
    setMonth(date.getUTCMonth());
  }

  return (
    <div className="ingreign-calendar-layout">
      <section className="ingreign-calendar-card">
        <header className="ingreign-calendar-toolbar">
          <div>
            <span>Content calendar</span>
            <h2>{monthNames[month]} {year}</h2>
          </div>
          <div>
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => { setMonth(currentDate.getUTCMonth()); setYear(currentDate.getUTCFullYear()); }}>Today</button>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
        </header>
        <div className="ingreign-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="ingreign-month-grid">
          {cells.map((day, index) => {
            if (!day) return <div className="is-empty" key={`empty-${index}`} />;
            const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayMarkers = markersByDate.get(date) ?? [];
            return (
              <article key={date} className={date === today ? "is-today" : undefined}>
                <time dateTime={date}>{day}</time>
                <div>
                  {dayMarkers.map((marker) => (
                    <Link key={marker.id} href={generatorHref(marker)} className={marker.presetKey === "event_day" ? "is-event" : marker.isManual ? "is-manual" : undefined} title={`Create ${marker.calendarLabel} post`}>
                      {marker.presetKey === "event_day" ? <Flame size={11} /> : null}
                      <span>{marker.calendarLabel}</span>
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="ingreign-upcoming-card">
        <div className="ingreign-section-label"><Flame size={14} /> Next to post</div>
        <h2>Ready when you are.</h2>
        <p>Each marker opens the generator with its countdown, date and caption already prepared.</p>
        <div className="ingreign-upcoming-list">
          {upcoming.map((marker) => (
            <Link href={generatorHref(marker)} key={marker.id}>
              <time dateTime={marker.date}><strong>{marker.dayLabel}</strong><span>{marker.monthLabel.slice(0, 3)}</span></time>
              <div><strong>{marker.calendarLabel}</strong><span>{formatIngreignDate(marker.date)}</span></div>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
        <Link className="ingreign-primary-action" href="/ingreign/generator"><ImagePlus size={17} /> Create a post</Link>
      </aside>
    </div>
  );
}

