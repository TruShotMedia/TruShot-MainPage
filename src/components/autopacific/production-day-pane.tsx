"use client";

import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { OutlookEventMark } from "@/components/shared/outlook-event-mark";
import { CalendarPostMark } from "@/components/shared/calendar-post-mark";
import { isOutlookEvent } from "@/lib/outlook-calendar/model";
import { isCalendarPost } from "@/lib/calendar-event";
import type { AgendaSource, TimedBlock } from "@/lib/production-agenda";
import { productionSelectedDay, type ProductionScheduleData } from "@/lib/production-selected-day";
import styles from "./production-hybrid.module.css";
import { CalendarTeamMarker, useCalendarTeamColors } from "@/components/shared/calendar-team-colors";
import { CalendarDragButton } from "@/components/shared/calendar-event-drag";
import { calendarTeamAttributes } from "@/lib/team-calendar-colors";


function tone(source: AgendaSource, today: string, currentTime: string) {
  if (isCalendarPost(source)) return source.post_completed_at ? "complete" : "autopacific";
  if ((source.client_name ?? "").toLowerCase() !== "autopacific group") return "unrelated";
  if ("delay_info" in source && (source.delay_info?.delayed_from || source.delay_info?.delayed_to)) return "delayed";
  if ("is_complete" in source && source.is_complete || source.entity_type === "calendar-event" && (source.end_date < today || source.end_date === today && !source.is_all_day && source.end_time && source.end_time.slice(0, 5) <= currentTime) || source.entity_type === "flight-event" && (source.arrival_date < today || source.arrival_date === today && source.arrival_time.slice(0, 5) <= currentTime)) return "complete";
  if ("due_date" in source && source.due_date && source.due_date < today) return "overdue";
  return "autopacific";
}

function DayPaneCard({ item, date, today, currentTime, onOpen, calendarMembers }: {
  item: ReturnType<typeof productionSelectedDay>["allDay"][number] | TimedBlock;
  date: string; today: string; currentTime: string; onOpen: (source: AgendaSource) => void;
  calendarMembers: ReturnType<typeof useCalendarTeamColors>;
}) {
  const { source } = item;
  const outlook = isOutlookEvent(source);
  return <CalendarDragButton type="button" source={source} postControl="checkbox" dragDay={date}
    dragId={`hybrid-${"time" in item ? "timed" : "all-day"}:${item.id}`} className={styles.card}
    {...calendarTeamAttributes(source, calendarMembers)} data-tone={tone(source, today, currentTime)}
    data-calendar-source={outlook ? "outlook" : undefined} onClick={() => onOpen(source)}>
    {"time" in item ? <time>{item.time}</time> : null}
    <strong><CalendarPostMark item={source} />{item.title}</strong>
    <CalendarTeamMarker record={source} />
    {!isCalendarPost(source) ? <small>{item.detail}</small> : null}
    {outlook ? <OutlookEventMark /> : null}
  </CalendarDragButton>;
}
export function ProductionDayPane({ data, date, today, currentTime = "00:00", onSelectDate, onOpen }: {
  data: ProductionScheduleData; date: string; today: string; currentTime?: string; onSelectDate: (date: string) => void;
  onOpen: (source: AgendaSource) => void;
}) {
  const calendarMembers = useCalendarTeamColors();
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
      </div>
    </header>
    <div className={styles.agenda} key={date}>
      {agenda.allDay.length ? <section aria-label="Selected day all-day items">
        <h3><CalendarDays size={13} />All day & deadlines</h3>
        {agenda.allDay.map(item => <DayPaneCard key={item.id} item={item} date={date} today={today} currentTime={currentTime} onOpen={open} calendarMembers={calendarMembers} />)}
      </section> : null}
      <section aria-label="Selected day timed bookings">
        <h3><Clock3 size={13} />Booked times <span>Brisbane</span></h3>
        {agenda.timed.length ? agenda.timed.map(item => <DayPaneCard key={item.id} item={item} date={date} today={today} currentTime={currentTime} onOpen={open} calendarMembers={calendarMembers} />)
          : <p className={styles.empty}>{agenda.allDay.length ? "No timed bookings for this day." : "A clear day. Select another date to see its schedule."}</p>}
      </section>
    </div>
  </aside>;
}
