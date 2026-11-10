"use client";

import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react";
import { OutlookEventMark } from "@/components/shared/outlook-event-mark";
import { isOutlookEvent } from "@/lib/outlook-calendar/model";
import type { AgendaSource } from "@/lib/production-agenda";
import { productionSelectedDay, type ProductionScheduleData } from "@/lib/production-selected-day";
import styles from "./production-hybrid.module.css";

function tone(source: AgendaSource, today: string, currentTime: string) {
  if ((source.client_name ?? "").toLowerCase() !== "autopacific group") return "unrelated";
  if ("delay_info" in source && (source.delay_info?.delayed_from || source.delay_info?.delayed_to)) return "delayed";
  if ("is_complete" in source && source.is_complete || source.entity_type === "calendar-event" && (source.end_date < today || source.end_date === today && !source.is_all_day && source.end_time && source.end_time.slice(0, 5) <= currentTime) || source.entity_type === "flight-event" && (source.arrival_date < today || source.arrival_date === today && source.arrival_time.slice(0, 5) <= currentTime)) return "complete";
  if ("due_date" in source && source.due_date && source.due_date < today) return "overdue";
  return "autopacific";
}
export function ProductionDayPane({ data, date, today, currentTime = "00:00", onSelectDate, onOpen, onCreate }: {
  data: ProductionScheduleData; date: string; today: string; currentTime?: string; onSelectDate: (date: string) => void;
  onOpen: (source: AgendaSource) => void; onCreate?: (date: string) => void;
}) {
  const agenda = productionSelectedDay(date, data);
  const count = agenda.allDay.length + agenda.timed.length;
  function open(source: AgendaSource) {
    onOpen(source.entity_type === "flight-event" ? data.flightEvents.find(leg => leg.id === source.id) ?? source : source);
  }
  return <aside className={styles.pane} aria-label="Selected day schedule">
    <header className={styles.heading}>
      <span>{date === today ? "Today, in focus" : "Day in focus"}</span>
      <h2>{format(parseISO(date), "EEEE")}</h2>
      <p><time dateTime={date}>{format(parseISO(date), "d MMMM yyyy")}</time><small>{count} {count === 1 ? "item" : "items"}</small></p>
      <div className={styles.controls}>
        <button type="button" aria-label="Previous selected day" onClick={() => onSelectDate(format(addDays(parseISO(date), -1), "yyyy-MM-dd"))}><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => onSelectDate(today)}>Today</button>
        <button type="button" aria-label="Next selected day" onClick={() => onSelectDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}><ChevronRight size={16} /></button>
        {onCreate ? <button type="button" className={styles.add} aria-label={`Add event on selected day ${date}`} onClick={() => onCreate(date)}><Plus size={16} />Event</button> : null}
      </div>
    </header>
    <div className={styles.agenda} key={date}>
      {agenda.allDay.length ? <section aria-label="Selected day all-day items"><h3><CalendarDays size={13} />All day & deadlines</h3>{agenda.allDay.map(item => <button type="button" key={item.id} className={styles.card} data-tone={tone(item.source, today, currentTime)} data-calendar-source={isOutlookEvent(item.source) ? "outlook" : undefined} onClick={() => open(item.source)}><strong>{item.title}</strong><small>{item.detail}</small>{isOutlookEvent(item.source) ? <OutlookEventMark /> : null}</button>)}</section> : null}
      <section aria-label="Selected day timed bookings"><h3><Clock3 size={13} />Booked times <span>Brisbane</span></h3>{agenda.timed.map(item => <button type="button" key={item.id} className={styles.card} data-tone={tone(item.source, today, currentTime)} data-calendar-source={isOutlookEvent(item.source) ? "outlook" : undefined} onClick={() => open(item.source)}><time>{item.time}</time><strong>{item.title}</strong><small>{item.detail}</small>{isOutlookEvent(item.source) ? <OutlookEventMark /> : null}</button>)}{!agenda.timed.length ? <p className={styles.empty}>{agenda.allDay.length ? "No timed bookings for this day." : "A clear day. Select another date to see its schedule."}</p> : null}</section>
    </div>
  </aside>;
}
