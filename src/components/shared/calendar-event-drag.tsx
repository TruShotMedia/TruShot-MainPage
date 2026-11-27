"use client";

import { createContext, useContext, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { CalendarClock } from "lucide-react";
import { CalendarPostCheckbox, useCalendarPostControl } from "./calendar-post-completion";
import { calendarResizeDrop, calendarTimeDrop, grabbedCalendarDay, sameDayCalendarEventWindow, type CalendarEventMove, type CalendarEventMoveResult, type CalendarResizeEdge } from "@/lib/calendar-event";
import { canResizeCalendarJob, jobShootResizeWindow, resizedCalendarJobDates, type CalendarJobResize, type CalendarJobResizeResult } from "@/lib/calendar-job-resize";
import type { CalendarCustomEvent, CalendarJob } from "@/lib/types";
import "./calendar-event-drag.css";

export type MoveCalendarEvent = (change: CalendarEventMove) => Promise<CalendarEventMoveResult>;
export type ResizeCalendarJob = (change: CalendarJobResize) => Promise<CalendarJobResizeResult>;
type MoveKind = "date" | "time" | "date-time";
type EventDragData = { event: CalendarCustomEvent; days: readonly string[] } & (
  { kind: MoveKind } | { kind: "resize"; edge: CalendarResizeEdge; bookingId: string }
);
type JobDragData =
  | { kind: "job-time-resize"; job: CalendarJob; date: string; edge: CalendarResizeEdge; bookingId: string }
  | { kind: "job-date-resize"; job: CalendarJob; date: string; edge: CalendarResizeEdge };
type DragData = EventDragData | JobDragData;
type ClockGrid = { firstMinute: number; lastMinute: number; hourHeight: number; allowsDateMove?: boolean };
type DragTarget = { date: string; clockGrid?: ClockGrid };
type ResizePreview = {
  kind: "resize"; date: string; text: string; bookingId: string; top: number; height: number; compact: boolean;
  resize: NonNullable<CalendarEventMove["resize"]>;
};
type ClockPreview = ResizePreview | { kind: "move"; date: string; text: string; startMinute: number };
type JobDatePreview = { kind: "job-date"; job: CalendarJob; date: string; edge: CalendarResizeEdge; text: string };
type DragPreview = ClockPreview | JobDatePreview;
const MoveAvailability = createContext<"disabled" | "ready" | "saving">("disabled");
const JobResizeAvailability = createContext<"disabled" | "ready" | "saving">("disabled");
const Preview = createContext<DragPreview | null>(null);

export function useJobCalendarResizeAvailability() {
  return useContext(JobResizeAvailability);
}

export function useJobCalendarDatePreview() {
  const preview = useContext(Preview);
  return preview?.kind === "job-date" ? preview : null;
}

export function timedBookingGeometry(start: number, end: number, firstMinute: number, hourHeight: number) {
  const duration = (end - start) * hourHeight / 60;
  return { top: (start - firstMinute) * hourHeight / 60, height: Math.min(duration, Math.max(14, duration - 3)) };
}

function dragPreview({ active, over, delta }: DragMoveEvent): DragPreview | null {
  const item = active.data.current as DragData | undefined;
  const target = over?.data.current as DragTarget | undefined;
  if (!item || !target) return null;
  if (item.kind === "job-date-resize") {
    if (target.clockGrid || target.date === item.date) return null;
    const adjusted = resizedCalendarJobDates(item.job, item.edge, target.date);
    return adjusted && !adjusted.unchanged ? {
      kind: "job-date", job: { ...item.job, shoot_date: adjusted.shoot_date, due_date: adjusted.due_date },
      date: target.date, edge: item.edge, text: format(parseISO(target.date), "EEE d MMM"),
    } : null;
  }
  if (item.kind === "date" || !target.clockGrid) return null;
  if (item.kind === "job-time-resize") {
    if (target.date !== item.date) return null;
    const { hourHeight, firstMinute, lastMinute } = target.clockGrid;
    const window = jobShootResizeWindow(item.job, item.date);
    const drop = window && calendarResizeDrop(window, item.date, item.edge, delta.y * 60 / hourHeight, firstMinute, lastMinute);
    return drop ? resizePreview(item, target.date, drop, firstMinute, hourHeight) : null;
  }
  if (target.date !== item.days[0] && (item.kind !== "date-time" || !target.clockGrid.allowsDateMove)) return null;
  const { hourHeight, firstMinute, lastMinute } = target.clockGrid;
  const minutes = delta.y * 60 / hourHeight;
  if (item.kind === "resize") {
    const drop = calendarResizeDrop(item.event, target.date, item.edge, minutes, firstMinute, lastMinute);
    if (!drop) return null;
    return resizePreview(item, target.date, drop, firstMinute, hourHeight);
  }
  const drop = calendarTimeDrop(item.event, item.days[0], minutes, firstMinute, lastMinute);
  return drop ? { kind: "move", date: target.date, startMinute: drop.startMinute, text: `${drop.start_time.slice(0, 5)}–${drop.end_time.slice(0, 5)}` } : null;
}

function resizePreview(item: { edge: CalendarResizeEdge; bookingId: string }, date: string,
  drop: NonNullable<ReturnType<typeof calendarResizeDrop>>, firstMinute: number, hourHeight: number): ResizePreview {
  const { startMinute: start, endMinute: end } = drop;
  return { kind: "resize", date, bookingId: item.bookingId, compact: end - start < 45,
    ...timedBookingGeometry(start, end, firstMinute, hourHeight),
    text: `${drop.startTime.slice(0, 5)}–${drop.endTime.slice(0, 5)}`, resize: { edge: item.edge, minute: drop.minute } };
}

export function CalendarEventDrag({ onMove, onResizeJob, children }: { onMove?: MoveCalendarEvent; onResizeJob?: ResizeCalendarJob; children: ReactNode }) {
  const contextId = useId();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState<"job" | "event" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 240, tolerance: 8 } }),
  );
  function updatePreview(event: DragMoveEvent) {
    if ((event.active.data.current as DragData | undefined)?.kind === "date") return;
    const next = dragPreview(event);
    setPreview(previous => previous?.kind === next?.kind && previous?.date === next?.date && previous?.text === next?.text ? previous : next);
  }
  async function finish(event: DragEndEvent) {
    const { active, activatorEvent, over } = event;
    const next = dragPreview(event);
    setTitle("");
    const item = active.data.current as DragData | undefined;
    if (!item || !over || saving) { setPreview(null); return; }
    if (item.kind === "job-time-resize" || item.kind === "job-date-resize") {
      const common = { id: item.job.id, expectedUpdatedAt: item.job.updated_at ?? "", edge: item.edge, date: next?.date ?? item.date };
      const change = next?.kind === "resize" && item.kind === "job-time-resize"
        ? { ...common, axis: "time" as const, minute: next.resize.minute }
        : next?.kind === "job-date" && item.kind === "job-date-resize" ? { ...common, axis: "date" as const } : null;
      if (!onResizeJob || !change || !next) { setPreview(null); return; }
      setPreview(next);
      setSaving("job");
      setNotice(null);
      try {
        const result = await onResizeJob(change);
        setNotice(result.ok
          ? { text: change.axis === "time" ? `Resized “${item.job.title}” to ${next.text}.` : `“${item.job.title}” ${change.edge === "start" ? "shoot date" : "deadline"} updated to ${next.text}.` }
          : { text: result.error, error: true });
      } catch {
        setNotice({ text: "Couldn’t confirm the job resize. Refresh the calendar before trying again.", error: true });
      } finally {
        setPreview(null);
        setSaving(null);
      }
      return;
    }
    const time = next?.kind === "job-date" ? null : next;
    // Keep the preview on the original booking until the saved time replaces it.
    setPreview(time?.kind === "resize" && onMove && !saving ? time : null);
    if (!onMove) return;
    const target = over.data.current as DragTarget | undefined;
    const to = target?.date;
    if (!item || typeof to !== "string") return;
    if (item.kind === "time" && (!time || to !== item.days[0])) return;
    if (item.kind === "resize" && time?.kind !== "resize") return;
    if (item.kind === "date" && target?.clockGrid && !target.clockGrid.allowsDateMove) return;
    const rect = active.rect.current.initial;
    const x = "clientX" in activatorEvent ? (activatorEvent as MouseEvent).clientX
      : "touches" in activatorEvent ? (activatorEvent as TouchEvent).touches[0]?.clientX : undefined;
    const from = rect && x !== undefined ? grabbedCalendarDay(item.days, rect.left, rect.width, x) : item.days[0];
    if (!from || (!time && from === to)) return;
    setSaving("event");
    setNotice(null);
    try {
      const adjustment = time?.kind === "resize" ? { resize: time.resize } : time ? { startMinute: time.startMinute } : {};
      const result = await onMove({ id: item.event.id, expectedUpdatedAt: item.event.updated_at, from, to, ...adjustment });
      setNotice(result.ok
        ? { text: `${time?.kind === "resize" ? "Resized" : "Moved"} “${item.event.title}” to ${[(!time || from !== to) && format(parseISO(result.dates.start_date), "EEE d MMM"), time?.text].filter(Boolean).join(", ")}.` }
        : { text: result.error, error: true });
    } catch {
      setNotice({ text: "Couldn’t confirm the change. Refresh the calendar before trying again.", error: true });
    } finally {
      setPreview(null);
      setSaving(null);
    }
  }
  if (!onMove && !onResizeJob) return children;
  return <MoveAvailability.Provider value={!onMove ? "disabled" : saving ? "saving" : "ready"}>
    <JobResizeAvailability.Provider value={!onResizeJob ? "disabled" : saving ? "saving" : "ready"}>
    <DndContext id={contextId} sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={({ active }) => {
        const item = active.data.current as DragData | undefined;
        setNotice(null);
        setTitle(item && "event" in item && item.kind !== "resize" ? item.event.title : "");
      }}
      onDragMove={updatePreview} onDragOver={updatePreview}
      onDragCancel={() => { setTitle(""); setPreview(null); }} onDragEnd={event => void finish(event)}>
      <Preview.Provider value={preview}>{children}</Preview.Provider>
      <div className="calendar-move-status" role={notice?.error ? "alert" : "status"}>
        {saving === "job" ? "Updating job schedule…" : saving === "event" ? "Updating event…" : notice?.text ?? ""}
      </div>
      {typeof document !== "undefined" ? createPortal(
        <DragOverlay dropAnimation={null} adjustScale={false}>
          {title ? <div className="calendar-move-overlay"><CalendarClock size={15} aria-hidden="true" /><span>{title}</span>{preview ? <time>{preview.text}</time> : null}</div> : null}
        </DragOverlay>, document.body,
      ) : null}
    </DndContext>
    </JobResizeAvailability.Provider>
  </MoveAvailability.Provider>;
}

export function useCalendarEventDrag(source: { entity_type: string }, days: readonly string[], id: string, moveKind: MoveKind = "date") {
  const enabled = useContext(MoveAvailability) === "ready";
  const event = source.entity_type === "calendar-event" ? source as CalendarCustomEvent : null;
  const timed = moveKind !== "date" && event && Boolean(sameDayCalendarEventWindow(event, days[0]));
  const kind = moveKind === "date-time" && !timed ? "date" : moveKind;
  const canMove = enabled && Boolean(event?.updated_at && !event.external_source && days.length
    && (kind !== "time" || timed));
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id, disabled: !canMove, data: event ? { event, days, kind } satisfies EventDragData : undefined,
  });
  return { canMove, props: canMove ? {
    ...listeners,
    ref: setNodeRef,
    "data-calendar-movable": "true",
    "data-calendar-dragging": isDragging ? "true" : undefined,
  } : {} };
}

export function CalendarResizeHandle({ payload, dragId, label }: { payload: Extract<DragData, { kind: "resize" | "job-time-resize" | "job-date-resize" }>; dragId: string; label: string }) {
  const horizontal = payload.kind === "job-date-resize";
  const jobAvailability = useJobCalendarResizeAvailability();
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `${dragId}:resize:${payload.edge}`, data: payload, disabled: payload.kind !== "resize" && jobAvailability !== "ready",
  });
  return <span ref={setNodeRef} aria-hidden="true" className="calendar-resize-handle" data-calendar-resize-edge={payload.edge}
    data-calendar-resize-axis={horizontal ? "date" : undefined}
    data-calendar-resizing={isDragging || undefined} title={label}
    onMouseDown={event => { event.stopPropagation(); listeners?.onMouseDown?.(event); }}
    onTouchStart={event => { event.stopPropagation(); listeners?.onTouchStart?.(event); }}
    onClick={event => event.stopPropagation()} />;
}

export function CalendarDragButton({ source, dragDay, dragId, moveKind = "date", timedBooking, postControl, children, style, className, ...button }: ComponentPropsWithoutRef<"button"> & {
  source: { entity_type: string }; dragDay?: string; dragId: string; moveKind?: MoveKind;
  timedBooking?: { time: string; compact: boolean; resizable: boolean };
  postControl?: "checkbox" | "mobile-hour" | "mobile-tile";
}) {
  const controls = useCalendarPostControl(source);
  const showCheck = postControl && controls;
  const preview = useContext(Preview);
  const resize = preview?.kind === "resize" && preview.bookingId === dragId ? preview : null;
  const { canMove, props } = useCalendarEventDrag(source, dragDay ? [dragDay] : [], dragId, moveKind);
  const jobResize = useJobCalendarResizeAvailability();
  const event = canMove && timedBooking?.resizable && dragDay && source.entity_type === "calendar-event" ? source as CalendarCustomEvent : null;
  const job = jobResize !== "disabled" && timedBooking?.resizable && source.entity_type === "job" ? source as CalendarJob : null;
  const jobWindow = job && dragDay && canResizeCalendarJob(job) ? jobShootResizeWindow(job, dragDay) : null;
  const canResize = dragDay && (event ? sameDayCalendarEventWindow(event, dragDay) : jobWindow && sameDayCalendarEventWindow(jobWindow, dragDay));
  const geometry = resize ? { ...style, top: resize.top, height: resize.height } : style;
  const positioned = showCheck && (timedBooking || postControl === "mobile-hour");
  const complete = source.entity_type === "calendar-event" && Boolean((source as CalendarCustomEvent).post_completed_at);
  const entry = <button {...button} {...props} data-calendar-resizable={Boolean(canResize || resize) || undefined}
    data-calendar-resize-preview={resize ? "" : undefined}
    data-calendar-post-complete={complete || undefined}
    style={positioned ? { ...style, top: 0, left: 0, width: "100%", height: "100%", paddingInlineEnd: 30 } : showCheck ? { ...geometry, paddingInlineEnd: 29 } : geometry}
    className={(resize?.compact ?? timedBooking?.compact) ? `${className ?? ""} is-short` : className}>
    {timedBooking ? <small>{resize?.text ?? timedBooking.time}</small> : null}
    {children}
    {canResize && dragDay ? (["start", "end"] as const).map(edge => {
      const payload = event ? { kind: "resize" as const, event, days: [dragDay], edge, bookingId: dragId }
        : job ? { kind: "job-time-resize" as const, job, date: dragDay, edge, bookingId: dragId } : null;
      return payload ? <CalendarResizeHandle key={edge} dragId={dragId} payload={payload}
        label={`Drag to change ${job ? "shoot " : ""}${edge === "start" ? "start" : "finish"} time`} /> : null;
    }) : null}
  </button>;
  if (!showCheck) return entry;
  return <div className={`calendar-post-control${positioned ? " is-positioned" : ""}${postControl !== "checkbox" ? ` is-${postControl}` : ""}`}
    style={positioned ? geometry : undefined}>
    {entry}
    <CalendarPostCheckbox control={showCheck} />
  </div>;
}

type DayProps = { date: string; targetId?: string; clockGrid?: ClockGrid; disableDrop?: boolean } & (
  | ({ as?: "div" } & ComponentPropsWithoutRef<"div">)
  | ({ as: "button" } & ComponentPropsWithoutRef<"button">)
);

export function CalendarDropDay({ as, date, targetId, clockGrid, disableDrop, children, ...props }: DayProps) {
  const availability = useContext(MoveAvailability);
  const jobResize = useJobCalendarResizeAvailability();
  const enabled = (availability === "ready" || jobResize === "ready") && !disableDrop;
  const preview = useContext(Preview);
  const { setNodeRef, isOver, active } = useDroppable({
    id: targetId ?? `day:${date}`, disabled: !enabled, data: { date, clockGrid },
  });
  const kind = (active?.data.current as DragData | undefined)?.kind;
  const moving = kind !== "resize" && kind !== "job-time-resize";
  const highlight = moving && enabled && isOver && (!clockGrid || (clockGrid.allowsDateMove && preview?.date !== date)) ? "true" : undefined;
  const drop = { ref: enabled ? setNodeRef : undefined, "data-calendar-drop-over": highlight };
  return as === "button"
    ? <button {...props as ComponentPropsWithoutRef<"button">} {...drop}>{children}</button>
    : <div {...props as ComponentPropsWithoutRef<"div">} {...drop}>
      {children}
      {enabled && isOver && clockGrid && preview?.kind === "move" && preview.date === date
        ? <span className="calendar-time-drop-preview" data-calendar-time-preview=""
          aria-hidden="true" style={{ top: (preview.startMinute - clockGrid.firstMinute) * clockGrid.hourHeight / 60 }}>{preview.text}</span> : null}
    </div>;
}

export function CalendarDayTimeTools({ mobile, week, fullDay, onToggle }: { mobile?: boolean; week?: boolean; fullDay: boolean; onToggle: () => void }) {
  const showDragHelp = useContext(MoveAvailability) !== "disabled";
  const showJobHelp = useJobCalendarResizeAvailability() !== "disabled";
  return <div className="calendar-day-time-tools">
    {showDragHelp ? <p className="calendar-move-help">{week
      ? "Drag an event to move it. Drag its top or bottom edge to resize."
      : mobile ? "Touch and hold a timed event, then drag it to a new time." : "Drag an event up or down to move it, or drag an edge to resize."}{showJobHelp ? " Drag a shoot’s top or bottom edge to adjust its hours." : ""}</p>
      : showJobHelp ? <p className="calendar-move-help">Drag a shoot’s top or bottom edge to adjust its hours.</p> : null}
    <button type="button" onClick={onToggle}>{fullDay ? "Show fewer hours" : "Show all 24 hours"}</button>
  </div>;
}
