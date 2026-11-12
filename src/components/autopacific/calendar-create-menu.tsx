"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { BriefcaseBusiness, CalendarPlus2, ListTodo, Plane, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TabletCreateKind } from "@/components/tablet/tablet-workspace-editors";
import styles from "./calendar-create-menu.module.css";

const options = [
  { kind: "job", label: "Job brief", icon: BriefcaseBusiness },
  { kind: "event", label: "Calendar event", icon: CalendarPlus2 },
  { kind: "task", label: "Task / asset", icon: ListTodo },
  { kind: "flight", label: "Flight plan", icon: Plane },
] as const;

export function CalendarCreateMenu({ date, productionTools, onCreate, className = "", label }: {
  date: string; productionTools: boolean; onCreate: (kind: TabletCreateKind, date: string) => void;
  className?: string; label?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const items = options.filter(item => productionTools || item.kind === "job" || item.kind === "event");
  const day = format(parseISO(date), "d MMMM yyyy");

  function close(restoreFocus = false) {
    setHost(null);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!host) return;
    function place() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(250, window.innerWidth - 24);
      const height = menu.current?.getBoundingClientRect().height || 240;
      const below = rect.bottom + 8;
      const top = below + height <= window.innerHeight - 12 ? below : rect.top - height - 8;
      setPosition({ width, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), top: Math.max(12, Math.min(top, window.innerHeight - height - 12)) });
    }
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setHost(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); setHost(null); trigger.current?.focus({ preventScroll: true });
    }
    place();
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [host]);

  return <>
    <button ref={trigger} type="button" className={`${styles.trigger} ${className}`} aria-label={`Add to calendar on ${day}`}
      aria-haspopup="menu" aria-expanded={Boolean(host)} aria-controls={host ? id : undefined} title={`Add to ${day}`}
      onClick={() => host ? close() : setHost(trigger.current?.closest(".apg-desktop") ?? document.body)}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setHost(trigger.current?.closest(".apg-desktop") ?? document.body); } }}>
      <span className={styles.icon}><Plus size={label ? 15 : 13} /></span>{label ? <span>{label}</span> : null}
    </button>
    {host ? createPortal(<div id={id} ref={menu} role="menu" aria-label={`Create on ${day}`} className={styles.menu} style={position}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close(); }}
      onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
        if (event.key === "Tab") close(true);
      }}>
      <div className={styles.date}>Add to {format(parseISO(date), "EEE, d MMM")}</div>
      {items.map(({ kind, label, icon: Icon }, index) => <button type="button" role="menuitem" key={kind} style={{ "--create-delay": `${index * 25}ms` } as CSSProperties}
        onClick={() => { close(); onCreate(kind, date); }}><Icon size={17} /><span>{label}</span></button>)}
    </div>, host) : null}
  </>;
}
