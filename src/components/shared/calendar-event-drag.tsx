"use client";

import { createContext, useContext, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { CalendarClock } from "lucide-react";
import { calendarTimeDrop, grabbedCalendarDay, sameDayCalendarEventWindow, type CalendarEventMove, type CalendarEventMoveResult } from "@/lib/calendar-event";
import type { CalendarCustomEvent } from "@/lib/types";
import "./calendar-event-drag.css";

export type MoveCalendarEvent = (change: CalendarEventMove) => Promise<CalendarEventMoveResult>;
type DragData = { event: CalendarCustomEvent; days: readonly string[]; clock: boolean };
type ClockGrid = { firstMinute: number; lastMinute: number; hourHeight: number };
type ClockPreview = { date: string; startMinute: number; text: string };
const MoveAvailability = createContext<"disabled" | "ready" | "saving">("disabled");
const Preview = createContext<ClockPreview | null>(null);

function clockPreview({ active, over, delta }: DragMoveEvent): ClockPreview | null {
  const item = active.data.current as DragData | undefined;
  const target = over?.data.current as { date: string; clockGrid?: ClockGrid } | undefined;
  if (!item?.clock || !target?.clockGrid || target.date !== item.days[0]) return null;
  const { hourHeight, firstMinute, lastMinute } = target.clockGrid;
  const drop = calendarTimeDrop(item.event, target.date, delta.y * 60 / hourHeight, firstMinute, lastMinute);
  return drop ? { date: target.date, startMinute: drop.startMinute, text: `${drop.start_time.slice(0, 5)}–${drop.end_time.slice(0, 5)}` } : null;
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
    if (!(event.active.data.current as DragData | undefined)?.clock) return;
    const next = clockPreview(event);
    setPreview(previous => previous?.date === next?.date && previous?.startMinute === next?.startMinute ? previous : next);
  }
  async function finish(event: DragEndEvent) {
    const { active, activatorEvent, over } = event;
    setTitle("");
    setPreview(null);
    if (!over || !onMove || saving) return;
    const item = active.data.current as DragData | undefined;
    const to = over.data.current?.date;
    if (!item || typeof to !== "string") return;
    const time = item.clock ? clockPreview(event) : null;
    if (item.clock ? !time : over.data.current?.clockGrid) return;
    const rect = active.rect.current.initial;
    const x = "clientX" in activatorEvent ? (activatorEvent as MouseEvent).clientX
      : "touches" in activatorEvent ? (activatorEvent as TouchEvent).touches[0]?.clientX : undefined;
    const from = rect && x !== undefined ? grabbedCalendarDay(item.days, rect.left, rect.width, x) : item.days[0];
    if (!from || (!time && from === to)) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await onMove({ id: item.event.id, expectedUpdatedAt: item.event.updated_at, from, to, ...(time ? { startMinute: time.startMinute } : {}) });
      setNotice(result.ok
        ? { text: `Moved “${item.event.title}” to ${time?.text ?? format(parseISO(result.dates.start_date), "EEE d MMM")}.` }
        : { text: result.error, error: true });
    } catch {
      setNotice({ text: "Couldn’t confirm the move. Refresh the calendar before trying again.", error: true });
    } finally {
      setSaving(false);
    }
  }
  if (!onMove) return children;
  return <MoveAvailability.Provider value={saving ? "saving" : "ready"}>
    <DndContext id={contextId} sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={({ active }) => { setNotice(null); setTitle((active.data.current as DragData | undefined)?.event.title ?? ""); }}
      onDragMove={updatePreview} onDragOver={updatePreview}
      onDragCancel={() => { setTitle(""); setPreview(null); }} onDragEnd={event => void finish(event)}>
      <Preview.Provider value={preview}>{children}</Preview.Provider>
      <div className="calendar-move-status" role={notice?.error ? "alert" : "status"}>
        {saving ? "Moving event…" : notice?.text ?? ""}
      </div>
      {typeof document !== "undefined" ? createPortal(
        <DragOverlay dropAnimation={null} adjustScale={false}>
          {title ? <div className="calendar-move-overlay"><CalendarClock size={15} aria-hidden="true" /><span>{title}</span>{preview ? <time>{preview.text}</time> : null}</div> : null}
        </DragOverlay>, document.body,
      ) : null}
    </DndContext>
  </MoveAvailability.Provider>;
}

export function useCalendarEventDrag(source: { entity_type: string }, days: readonly string[], id: string, clock = false) {
  const enabled = useContext(MoveAvailability) === "ready";
  const event = source.entity_type === "calendar-event" ? source as CalendarCustomEvent : null;
  const canMove = enabled && Boolean(event?.updated_at && !event.external_source && days.length
    && (!clock || sameDayCalendarEventWindow(event, days[0])));
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id, disabled: !canMove, data: event ? { event, days, clock } satisfies DragData : undefined,
  });
  return { canMove, props: canMove ? {
    ...listeners,
    ref: setNodeRef,
    "data-calendar-movable": "true",
    "data-calendar-dragging": isDragging ? "true" : undefined,
  } : {} };
}

export function CalendarDragButton({ source, dragDay, dragId, dragTime = false, ...button }: ComponentPropsWithoutRef<"button"> & {
  source: { entity_type: string }; dragDay?: string; dragId: string; dragTime?: boolean;
}) {
  const { props } = useCalendarEventDrag(source, dragDay ? [dragDay] : [], dragId, dragTime);
  return <button {...button} {...props} />;
}

type DayProps = { date: string; targetId?: string; clockGrid?: ClockGrid; disableDrop?: boolean } & (
  | ({ as?: "div" } & ComponentPropsWithoutRef<"div">)
  | ({ as: "button" } & ComponentPropsWithoutRef<"button">)
);

export function CalendarDropDay({ as, date, targetId, clockGrid, disableDrop, children, ...props }: DayProps) {
  const enabled = useContext(MoveAvailability) === "ready" && !disableDrop;
  const preview = useContext(Preview);
  const { setNodeRef, isOver } = useDroppable({
    id: targetId ?? `day:${date}`, disabled: !enabled, data: { date, clockGrid },
  });
  const highlight = enabled && isOver && !clockGrid ? "true" : undefined;
  const drop = { ref: enabled ? setNodeRef : undefined, "data-calendar-drop-over": highlight };
  return as === "button"
    ? <button {...props as ComponentPropsWithoutRef<"button">} {...drop}>{children}</button>
    : <div {...props as ComponentPropsWithoutRef<"div">} {...drop}>
      {children}
      {enabled && isOver && clockGrid && preview?.date === date ? <span className="calendar-time-drop-preview" data-calendar-time-preview=""
        aria-hidden="true" style={{ top: (preview.startMinute - clockGrid.firstMinute) * clockGrid.hourHeight / 60 }}>{preview.text}</span> : null}
    </div>;
}

export function CalendarDayTimeTools({ mobile, fullDay, onToggle }: { mobile?: boolean; fullDay: boolean; onToggle: () => void }) {
  const showDragHelp = useContext(MoveAvailability) !== "disabled";
  return <div className="calendar-day-time-tools">
    {showDragHelp ? <p className="calendar-move-help">{mobile ? "Touch and hold a timed event, then drag it to a new time." : "Drag a timed event up or down to change its time."}</p> : null}
    <button type="button" onClick={onToggle}>{fullDay ? "Show fewer hours" : "Show all 24 hours"}</button>
  </div>;
}
