"use client";

import { useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addMonths,
  differenceInCalendarDays,
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
import { AlertTriangle, BriefcaseBusiness, CalendarCheck2, ChevronLeft, ChevronRight, CircleDot, Clock3, ListTodo, LoaderCircle, X } from "lucide-react";
import { updateCalendarItem } from "@/app/admin/actions";
import type { CalendarItem, CalendarJob, CalendarTask } from "@/lib/types";

type CalendarFilter = "all" | "jobs" | "tasks";
type CalendarEvent = {
  id: string;
  date: string;
  kind: "shoot" | "job-due" | "task-due";
  label: string;
  item: CalendarItem;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const priorityWeight: Record<CalendarTask["priority"], number> = { low: 0, normal: 1, high: 2, urgent: 3 };

function getDueDate(item: CalendarItem) {
  return item.due_date;
}

function getCalendarEvents(items: CalendarItem[]): CalendarEvent[] {
  return items.flatMap((item) => {
    if (item.entity_type === "job") {
      const events: CalendarEvent[] = [];
      if (item.shoot_date) events.push({ id: `${item.id}-shoot`, date: item.shoot_date, kind: "shoot", label: "Shoot", item });
      if (item.due_date) events.push({ id: `${item.id}-due`, date: item.due_date, kind: "job-due", label: "Job due", item });
      return events;
    }
    return item.due_date ? [{ id: `${item.id}-due`, date: item.due_date, kind: "task-due" as const, label: "Asset due", item }] : [];
  });
}

function dueLabel(date: string, today: string) {
  const difference = differenceInCalendarDays(parseISO(date), parseISO(today));
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  if (difference === 0) return "Due today";
  if (difference === 1) return "Due tomorrow";
  return `Due in ${difference}d`;
}

function CalendarEventButton({ event, onOpen }: { event: CalendarEvent; onOpen: (item: CalendarItem) => void }) {
  return (
    <button type="button" className={`calendar-event calendar-event-${event.kind}`} onClick={() => onOpen(event.item)} title={`${event.label}: ${event.item.title}`}>
      <span />
      <strong>{event.label}</strong>
      <em>{event.item.title}</em>
    </button>
  );
}

export function CalendarManager({ jobs, tasks }: { jobs: CalendarJob[]; tasks: CalendarTask[] }) {
  const router = useRouter();
  const [items, setItems] = useState<CalendarItem[]>([...jobs, ...tasks]);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const today = format(new Date(), "yyyy-MM-dd");

  const visibleItems = useMemo(() => items.filter((item) => {
    if (!showCompleted && item.is_complete) return false;
    if (filter === "jobs") return item.entity_type === "job";
    if (filter === "tasks") return item.entity_type === "task";
    return true;
  }), [filter, items, showCompleted]);
  const events = useMemo(() => getCalendarEvents(visibleItems), [visibleItems]);
  const calendarDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 }),
  }), [currentMonth]);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    return grouped;
  }, [events]);

  const activeItems = items.filter((item) => !item.is_complete);
  const overdueCount = activeItems.filter((item) => getDueDate(item) && getDueDate(item)! < today).length;
  const dueThisWeekCount = activeItems.filter((item) => {
    const dueDate = getDueDate(item);
    if (!dueDate) return false;
    const difference = differenceInCalendarDays(parseISO(dueDate), parseISO(today));
    return difference >= 0 && difference <= 7;
  }).length;
  const unscheduledItems = activeItems.filter((item) => !getDueDate(item));
  const priorityItems = activeItems
    .filter((item) => Boolean(getDueDate(item)))
    .sort((left, right) => {
      const leftDue = getDueDate(left)!;
      const rightDue = getDueDate(right)!;
      const leftOverdue = leftDue < today ? 1 : 0;
      const rightOverdue = rightDue < today ? 1 : 0;
      if (leftOverdue !== rightOverdue) return rightOverdue - leftOverdue;
      const leftPriority = left.entity_type === "task" ? priorityWeight[left.priority] : 1;
      const rightPriority = right.entity_type === "task" ? priorityWeight[right.priority] : 1;
      return rightPriority - leftPriority || leftDue.localeCompare(rightDue);
    })
    .slice(0, 8);
  const monthEvents = calendarDays
    .filter((day) => isSameMonth(day, currentMonth))
    .flatMap((day) => eventsByDay.get(format(day, "yyyy-MM-dd")) ?? []);

  function closeEditor() {
    setSelectedItem(null);
    setErrorMessage("");
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeEditor();
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setErrorMessage("");
    try {
      await updateCalendarItem(formData);
      const dueDate = String(formData.get("due_date") ?? "") || null;
      const shootDate = String(formData.get("shoot_date") ?? "") || null;
      const priority = String(formData.get("priority") ?? "normal") as CalendarTask["priority"];
      setItems((current) => current.map((item) => {
        if (item.id !== selectedItem.id || item.entity_type !== selectedItem.entity_type) return item;
        return item.entity_type === "job"
          ? { ...item, shoot_date: shootDate, due_date: dueDate }
          : { ...item, due_date: dueDate, priority };
      }));
      closeEditor();
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The schedule could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="calendar-kpis" aria-label="Deadline overview">
        <article className={overdueCount ? "calendar-kpi-alert" : ""}><AlertTriangle size={17} /><div><strong>{overdueCount}</strong><span>Overdue</span></div></article>
        <article><Clock3 size={17} /><div><strong>{dueThisWeekCount}</strong><span>Due next 7 days</span></div></article>
        <article><CalendarCheck2 size={17} /><div><strong>{jobs.filter((job) => !job.is_complete && job.shoot_date).length}</strong><span>Production dates</span></div></article>
        <article><CircleDot size={17} /><div><strong>{unscheduledItems.length}</strong><span>Without deadline</span></div></article>
      </section>

      <div className="calendar-layout">
        <section className="admin-card calendar-board">
          <header className="calendar-toolbar">
            <div className="calendar-month-controls">
              <button type="button" onClick={() => setCurrentMonth((month) => subMonths(month, 1))} aria-label="Previous month"><ChevronLeft size={17} /></button>
              <div><span>Schedule</span><h2>{format(currentMonth, "MMMM yyyy")}</h2></div>
              <button type="button" onClick={() => setCurrentMonth((month) => addMonths(month, 1))} aria-label="Next month"><ChevronRight size={17} /></button>
              <button type="button" className="calendar-today-button" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>Today</button>
            </div>
            <div className="calendar-filters" role="group" aria-label="Calendar filters">
              {(["all", "jobs", "tasks"] as const).map((option) => (
                <button type="button" className={filter === option ? "is-active" : ""} onClick={() => setFilter(option)} key={option}>{option}</button>
              ))}
              <label><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} /> Show completed</label>
            </div>
          </header>

          <div className="calendar-legend" aria-label="Calendar legend">
            <span><i className="legend-shoot" /> Shoot / production</span>
            <span><i className="legend-job-due" /> Job deadline</span>
            <span><i className="legend-task-due" /> Task deadline</span>
          </div>

          <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {calendarDays.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(dateKey) ?? [];
              return (
                <div className={`calendar-day ${!isSameMonth(day, currentMonth) ? "is-outside" : ""} ${dateKey === today ? "is-today" : ""}`} key={dateKey}>
                  <time dateTime={dateKey}>{format(day, "d")}</time>
                  <div>{dayEvents.slice(0, 4).map((event) => <CalendarEventButton event={event} onOpen={setSelectedItem} key={event.id} />)}</div>
                  {dayEvents.length > 4 && <small>+{dayEvents.length - 4} more</small>}
                </div>
              );
            })}
          </div>

          <div className="calendar-mobile-agenda">
            {monthEvents.length ? calendarDays.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(dateKey) ?? [];
              if (!isSameMonth(day, currentMonth) || !dayEvents.length) return null;
              return <section key={dateKey}><time dateTime={dateKey}><strong>{format(day, "d")}</strong><span>{format(day, "EEE")}</span></time><div>{dayEvents.map((event) => <CalendarEventButton event={event} onOpen={setSelectedItem} key={event.id} />)}</div></section>;
            }) : <p>No dated work matches these filters this month.</p>}
          </div>
        </section>

        <aside className="calendar-sidebar">
          <section className="admin-card priority-radar">
            <header><div><span>Focus now</span><h2>Priority radar</h2></div><AlertTriangle size={18} /></header>
            {priorityItems.length ? <div className="priority-radar-list">{priorityItems.map((item) => (
              <button type="button" onClick={() => setSelectedItem(item)} key={`${item.entity_type}-${item.id}`}>
                <span className={`priority-radar-icon ${item.entity_type === "task" ? `priority-${item.priority}` : ""}`}>{item.entity_type === "job" ? <BriefcaseBusiness size={14} /> : <ListTodo size={14} />}</span>
                <div><strong>{item.title}</strong><small>{item.entity_type === "task" ? item.job_title : item.client_name || "No client"}</small></div>
                <em className={getDueDate(item)! < today ? "is-overdue" : ""}>{dueLabel(getDueDate(item)!, today)}</em>
              </button>
            ))}</div> : <p className="calendar-side-empty">No open deadlines yet.</p>}
          </section>

          <section className="admin-card unscheduled-queue">
            <header><div><span>Needs a date</span><h2>Unscheduled</h2></div><strong>{unscheduledItems.length}</strong></header>
            {unscheduledItems.length ? <div>{unscheduledItems.slice(0, 7).map((item) => (
              <button type="button" onClick={() => setSelectedItem(item)} key={`${item.entity_type}-${item.id}`}><span>{item.entity_type === "job" ? "Job" : "Task"}</span><strong>{item.title}</strong></button>
            ))}</div> : <p className="calendar-side-empty">Everything open has a deadline.</p>}
          </section>
        </aside>
      </div>

      {selectedItem ? (
        <div className="calendar-editor-backdrop" onClick={handleBackdropClick} role="presentation">
          <form className="calendar-editor" onSubmit={saveSchedule} role="dialog" aria-modal="true" aria-labelledby="calendar-editor-title">
            <header>
              <div><span>{selectedItem.entity_type === "job" ? "Job schedule" : "Task deadline"}</span><h2 id="calendar-editor-title">{selectedItem.title}</h2><p>{selectedItem.status_label}{selectedItem.client_name ? ` · ${selectedItem.client_name}` : ""}</p></div>
              <button type="button" onClick={closeEditor} aria-label="Close schedule editor"><X size={17} /></button>
            </header>
            <input type="hidden" name="entity_type" value={selectedItem.entity_type} />
            <input type="hidden" name="id" value={selectedItem.id} />
            {selectedItem.entity_type === "job" ? (
              <div className="calendar-editor-fields">
                <label>Shoot / production date<input type="date" name="shoot_date" defaultValue={selectedItem.shoot_date ?? ""} /></label>
                <label>Job deadline<input type="date" name="due_date" defaultValue={selectedItem.due_date ?? ""} /></label>
              </div>
            ) : (
              <div className="calendar-editor-fields">
                <label>Task deadline<input type="date" name="due_date" defaultValue={selectedItem.due_date ?? ""} /></label>
                <label>Priority<select name="priority" defaultValue={selectedItem.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
              </div>
            )}
            {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
            <footer><button type="button" onClick={closeEditor}>Cancel</button><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : "Save schedule"}</button></footer>
          </form>
        </div>
      ) : null}
    </>
  );
}
