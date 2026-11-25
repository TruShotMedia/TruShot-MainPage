"use client";

import { createContext, useContext, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { CalendarClock } from "lucide-react";
import { calendarResizeDrop, calendarTimeDrop, grabbedCalendarDay, sameDayCalendarEventWindow, type CalendarEventMove, type CalendarEventMoveResult, type CalendarResizeEdge } from "@/lib/calendar-event";
import type { CalendarCustomEvent } from "@/lib/types";
import "./calendar-event-drag.css";

export type MoveCalendarEvent = (change: CalendarEventMove) => Promise<CalendarEventMoveResult>;
type MoveKind = "date" | "time" | "date-time";
type DragData = { event: CalendarCustomEvent; days: readonly string[] } & (
  { kind: MoveKind } | { kind: "resize"; edge: CalendarResizeEdge; bookingId: string }
);
type ClockGrid = { firstMinute: number; lastMinute: number; hourHeight: number; allowsDateMove?: boolean };
type DragTarget = { date: string; clockGrid?: ClockGrid };
type ResizePreview = {
  kind: "resize"; date: string; text: string; bookingId: string; top: number; height: number; compact: boolean;
  resize: NonNullable<CalendarEventMove["resize"]>;
};
type ClockPreview = ResizePreview | { kind: "move"; date: string; text: string; startMinute: number };
const MoveAvailability = createContext<"disabled" | "ready" | "saving">("disabled");
const Preview = createContext<ClockPreview | null>(null);

export function timedBookingGeometry(start: number, end: number, firstMinute: number, hourHeight: number) {
  return { top: (start - firstMinute) * hourHeight / 60, height: Math.max(14, (end - start) * hourHeight / 60 - 3) };
}

function clockPreview({ active, over, delta }: DragMoveEvent): ClockPreview | null {
  const item = active.data.current as DragData | undefined;
  const target = over?.data.current as DragTarget | undefined;
  if (!item || item.kind === "date" || !target?.clockGrid) return null;
  if (target.date !== item.days[0] && (item.kind !== "date-time" || !target.clockGrid.allowsDateMove)) return null;
  const { hourHeight, firstMinute, lastMinute } = target.clockGrid;
  const minutes = delta.y * 60 / hourHeight;
  if (item.kind === "resize") {
    const drop = calendarResizeDrop(item.event, target.date, item.edge, minutes, firstMinute, lastMinute);
    if (!drop) return null;
    const start = Math.floor(drop.startMinute), end = Math.floor(drop.endMinute);
    return { kind: "resize", date: target.date, bookingId: item.bookingId, compact: end - start < 45,
      ...timedBookingGeometry(start, end, firstMinute, hourHeight),
      text: `${drop.startTime.slice(0, 5)}–${drop.endTime.slice(0, 5)}`, resize: { edge: item.edge, minute: drop.minute } };
  }
  const drop = calendarTimeDrop(item.event, item.days[0], minutes, firstMinute, lastMinute);
  return drop ? { kind: "move", date: target.date, startMinute: drop.startMinute, text: `${drop.start_time.slice(0, 5)}–${drop.end_time.slice(0, 5)}` } : null;
}

export function CalendarEventDrag({ onMove, children }: { onMove?: MoveCalendarEvent; children: ReactNode }) {
  const contextId = useId();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [preview, setPreview] = useState<ClockPreview | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 240, tolerance: 8 } }),
  );
  function updatePreview(event: DragMoveEvent) {
    if ((event.active.data.current as DragData | undefined)?.kind === "date") return;
    const next = clockPreview(event);
    setPreview(previous => previous?.date === next?.date && previous?.text === next?.text ? previous : next);
  }
  async function finish(event: DragEndEvent) {
    const { active, activatorEvent, over } = event;
    const time = clockPreview(event);
    setTitle("");
    // Keep the preview on the original booking until the saved time replaces it.
    setPreview(time?.kind === "resize" && onMove && !saving ? time : null);
    if (!over || !onMove || saving) return;
    const item = active.data.current as DragData | undefined;
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
    setSaving(true);
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
      setSaving(false);
    }
  }
  if (!onMove) return children;
  return <MoveAvailability.Provider value={saving ? "saving" : "ready"}>
    <DndContext id={contextId} sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={({ active }) => {
        const item = active.data.current as DragData | undefined;
        setNotice(null);
        setTitle(item?.kind === "resize" ? "" : item?.event.title ?? "");
      }}
      onDragMove={updatePreview} onDragOver={updatePreview}
      onDragCancel={() => { setTitle(""); setPreview(null); }} onDragEnd={event => void finish(event)}>
      <Preview.Provider value={preview}>{children}</Preview.Provider>
      <div className="calendar-move-status" role={notice?.error ? "alert" : "status"}>
        {saving ? "Updating event…" : notice?.text ?? ""}
      </div>
      {typeof document !== "undefined" ? createPortal(
        <DragOverlay dropAnimation={null} adjustScale={false}>
          {title ? <div className="calendar-move-overlay"><CalendarClock size={15} aria-hidden="true" /><span>{title}</span>{preview ? <time>{preview.text}</time> : null}</div> : null}
        </DragOverlay>, document.body,
      ) : null}
    </DndContext>
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
    id, disabled: !canMove, data: event ? { event, days, kind } satisfies DragData : undefined,
  });
  return { canMove, props: canMove ? {
    ...listeners,
    ref: setNodeRef,
    "data-calendar-movable": "true",
    "data-calendar-dragging": isDragging ? "true" : undefined,
  } : {} };
}

function CalendarResizeHandle({ event, date, dragId, edge }: {
  event: CalendarCustomEvent; date: string; dragId: string; edge: CalendarResizeEdge;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `${dragId}:resize:${edge}`, data: { event, days: [date], kind: "resize", edge, bookingId: dragId } satisfies DragData,
  });
  return <span ref={setNodeRef} aria-hidden="true" className="calendar-resize-handle" data-calendar-resize-edge={edge}
    data-calendar-resizing={isDragging || undefined} title={edge === "start" ? "Drag to change start time" : "Drag to change finish time"}
    onMouseDown={event => { event.stopPropagation(); listeners?.onMouseDown?.(event); }}
    onTouchStart={event => { event.stopPropagation(); listeners?.onTouchStart?.(event); }}
    onClick={event => event.stopPropagation()} />;
}

export function CalendarDragButton({ source, dragDay, dragId, moveKind = "date", timedBooking, children, style, className, ...button }: ComponentPropsWithoutRef<"button"> & {
  source: { entity_type: string }; dragDay?: string; dragId: string; moveKind?: MoveKind;
  timedBooking?: { time: string; compact: boolean; resizable: boolean };
}) {
  const preview = useContext(Preview);
  const resize = preview?.kind === "resize" && preview.bookingId === dragId ? preview : null;
  const { canMove, props } = useCalendarEventDrag(source, dragDay ? [dragDay] : [], dragId, moveKind);
  const event = canMove && timedBooking?.resizable && dragDay && source.entity_type === "calendar-event" ? source as CalendarCustomEvent : null;
  const canResize = event && dragDay && sameDayCalendarEventWindow(event, dragDay);
  return <button {...button} {...props} data-calendar-resizable={Boolean(canResize || resize) || undefined}
    data-calendar-resize-preview={resize ? "" : undefined}
    style={resize ? { ...style, top: resize.top, height: resize.height } : style}
    className={(resize?.compact ?? timedBooking?.compact) ? `${className ?? ""} is-short` : className}>
    {timedBooking ? <small>{resize?.text ?? timedBooking.time}</small> : null}
    {children}
    {canResize && event && dragDay ? <>
      <CalendarResizeHandle event={event} date={dragDay} dragId={dragId} edge="start" />
      <CalendarResizeHandle event={event} date={dragDay} dragId={dragId} edge="end" />
    </> : null}
  </button>;
}

type DayProps = { date: string; targetId?: string; clockGrid?: ClockGrid; disableDrop?: boolean } & (
  | ({ as?: "div" } & ComponentPropsWithoutRef<"div">)
  | ({ as: "button" } & ComponentPropsWithoutRef<"button">)
);

export function CalendarDropDay({ as, date, targetId, clockGrid, disableDrop, children, ...props }: DayProps) {
  const enabled = useContext(MoveAvailability) === "ready" && !disableDrop;
  const preview = useContext(Preview);
  const { setNodeRef, isOver, active } = useDroppable({
    id: targetId ?? `day:${date}`, disabled: !enabled, data: { date, clockGrid },
  });
  const moving = (active?.data.current as DragData | undefined)?.kind !== "resize";
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
  return <div className="calendar-day-time-tools">
    {showDragHelp ? <p className="calendar-move-help">{week
      ? "Drag an event to move it. Drag its top or bottom edge to resize."
      : mobile ? "Touch and hold a timed event, then drag it to a new time." : "Drag an event up or down to move it, or drag an edge to resize."}</p> : null}
    <button type="button" onClick={onToggle}>{fullDay ? "Show fewer hours" : "Show all 24 hours"}</button>
  </div>;
}
