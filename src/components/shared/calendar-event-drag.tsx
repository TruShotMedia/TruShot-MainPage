"use client";

import { createContext, useContext, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { CalendarClock } from "lucide-react";
import { grabbedCalendarDay, type CalendarEventMove, type CalendarEventMoveResult } from "@/lib/calendar-event";
import type { CalendarCustomEvent } from "@/lib/types";
import "./calendar-event-drag.css";

export type MoveCalendarEvent = (change: CalendarEventMove) => Promise<CalendarEventMoveResult>;
type DragData = { event: CalendarCustomEvent; days: readonly string[] };
const MovesEnabled = createContext(false);

export function CalendarEventDrag({ onMove, children }: { onMove?: MoveCalendarEvent; children: ReactNode }) {
  const contextId = useId();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 240, tolerance: 8 } }),
  );
  async function finish({ active, activatorEvent, over }: DragEndEvent) {
    setTitle("");
    if (!over || !onMove || saving) return;
    const item = active.data.current as DragData | undefined;
    const to = over.data.current?.date;
    if (!item || typeof to !== "string") return;
    const rect = active.rect.current.initial;
    const x = "clientX" in activatorEvent ? (activatorEvent as MouseEvent).clientX
      : "touches" in activatorEvent ? (activatorEvent as TouchEvent).touches[0]?.clientX : undefined;
    const from = rect && x !== undefined ? grabbedCalendarDay(item.days, rect.left, rect.width, x) : item.days[0];
    if (!from || from === to) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await onMove({ id: item.event.id, expectedUpdatedAt: item.event.updated_at, from, to });
      setNotice(result.ok
        ? { text: `Moved “${item.event.title}” to ${format(parseISO(result.dates.start_date), "EEE d MMM")}.` }
        : { text: result.error, error: true });
    } catch {
      setNotice({ text: "Couldn’t confirm the move. Refresh the calendar before trying again.", error: true });
    } finally {
      setSaving(false);
    }
  }
  if (!onMove) return children;
  return <MovesEnabled.Provider value={!saving}>
    <DndContext id={contextId} sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={({ active }) => { setNotice(null); setTitle((active.data.current as DragData | undefined)?.event.title ?? ""); }}
      onDragCancel={() => setTitle("")} onDragEnd={event => void finish(event)}>
      {children}
      <div className="calendar-move-status" role={notice?.error ? "alert" : "status"}>
        {saving ? "Moving event…" : notice?.text ?? ""}
      </div>
      {typeof document !== "undefined" ? createPortal(
        <DragOverlay dropAnimation={null} adjustScale={false}>
          {title ? <div className="calendar-move-overlay"><CalendarClock size={15} aria-hidden="true" /><span>{title}</span></div> : null}
        </DragOverlay>, document.body,
      ) : null}
    </DndContext>
  </MovesEnabled.Provider>;
}

export function useCalendarEventDrag(source: { entity_type: string }, days: readonly string[], id: string) {
  const enabled = useContext(MovesEnabled);
  const event = source.entity_type === "calendar-event" ? source as CalendarCustomEvent : null;
  const canMove = enabled && Boolean(event?.updated_at && !event.external_source && days.length);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id, disabled: !canMove, data: event ? { event, days } satisfies DragData : undefined,
  });
  return { canMove, props: canMove ? {
    ...listeners,
    ref: setNodeRef,
    "data-calendar-movable": "true",
    "data-calendar-dragging": isDragging ? "true" : undefined,
  } : {} };
}

export function CalendarDragButton({ source, dragDay, dragId, ...button }: ComponentPropsWithoutRef<"button"> & {
  source: { entity_type: string }; dragDay?: string; dragId: string;
}) {
  const { props } = useCalendarEventDrag(source, dragDay ? [dragDay] : [], dragId);
  return <button {...button} {...props} />;
}

type DayProps = { date: string; targetId?: string } & (
  | ({ as?: "div" } & ComponentPropsWithoutRef<"div">)
  | ({ as: "button" } & ComponentPropsWithoutRef<"button">)
);

export function CalendarDropDay({ as, date, targetId, ...props }: DayProps) {
  const enabled = useContext(MovesEnabled);
  const { setNodeRef, isOver } = useDroppable({
    id: targetId ?? `day:${date}`, disabled: !enabled, data: { date },
  });
  const highlight = enabled && isOver ? "true" : undefined;
  const drop = { ref: enabled ? setNodeRef : undefined, "data-calendar-drop-over": highlight };
  return as === "button"
    ? <button {...props as ComponentPropsWithoutRef<"button">} {...drop} />
    : <div {...props as ComponentPropsWithoutRef<"div">} {...drop} />;
}
