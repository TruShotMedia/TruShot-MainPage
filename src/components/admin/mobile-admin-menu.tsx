"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Menu, X } from "lucide-react";
import { AdminNavigation } from "@/components/admin/admin-navigation";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type DragState = {
  mode: "opening" | "closing";
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  width: number;
  progress: number;
  active: boolean;
};

export function MobileAdminMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const closeMenu = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openMenu = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const activeLink = panelRef.current?.querySelector<HTMLElement>("a.is-active");
      const firstControl = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (activeLink ?? firstControl)?.focus({ preventScroll: true });
    });

    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyboard);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyboard);
    };
  }, [closeMenu, isOpen]);

  function applyDragProgress(progress: number) {
    const clamped = Math.max(0, Math.min(1, progress));
    if (panelRef.current) panelRef.current.style.transform = `translate3d(${(clamped - 1) * 100}%, 0, 0)`;
    if (backdropRef.current) backdropRef.current.style.opacity = String(clamped);
    if (dragRef.current) dragRef.current.progress = clamped;
  }

  function beginDrag(mode: DragState["mode"], event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const measuredWidth = panelRef.current?.getBoundingClientRect().width ?? 0;
    const width = measuredWidth > 0 ? measuredWidth : Math.min(window.innerWidth * 0.88, 326);
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      width,
      progress: mode === "opening" ? 0 : 1,
      active: false,
    };
    rootRef.current?.classList.add("is-gesture-active");
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.active) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
        rootRef.current?.classList.remove("is-gesture-active");
        dragRef.current = null;
        return;
      }
      if (Math.abs(deltaX) < 6) return;
      drag.active = true;
      suppressClickRef.current = true;
      rootRef.current?.classList.add("is-dragging");
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    event.preventDefault();
    const progress = drag.mode === "opening" ? deltaX / drag.width : 1 + deltaX / drag.width;
    applyDragProgress(progress);
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    rootRef.current?.classList.remove("is-gesture-active", "is-dragging");

    if (!drag.active) {
      panelRef.current?.style.removeProperty("transform");
      backdropRef.current?.style.removeProperty("opacity");
      return;
    }

    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const velocity = (event.clientX - drag.startX) / elapsed;
    const shouldOpen = drag.mode === "opening"
      ? drag.progress > 0.34 || velocity > 0.45
      : drag.progress > 0.66 && velocity > -0.45;

    setIsOpen(shouldOpen);
    window.requestAnimationFrame(() => {
      panelRef.current?.style.removeProperty("transform");
      backdropRef.current?.style.removeProperty("opacity");
    });
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  }

  function cancelDrag() {
    dragRef.current = null;
    rootRef.current?.classList.remove("is-gesture-active", "is-dragging");
    panelRef.current?.style.removeProperty("transform");
    backdropRef.current?.style.removeProperty("opacity");
  }

  return (
    <div ref={rootRef} className={`mobile-admin-menu${isOpen ? " is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="mobile-admin-menu-trigger"
        aria-controls="mobile-admin-navigation"
        aria-expanded={isOpen}
        onClick={() => isOpen ? closeMenu(false) : openMenu()}
      >
        {isOpen ? <X size={21} /> : <Menu size={21} />}
        <span>{isOpen ? "Close" : "Menu"}</span>
      </button>

      <div
        className="mobile-admin-menu-edge"
        aria-hidden="true"
        onPointerDown={(event) => beginDrag("opening", event)}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
      />

      <button
        ref={backdropRef}
        type="button"
        className="mobile-admin-menu-backdrop"
        aria-label="Close navigation menu"
        tabIndex={isOpen ? 0 : -1}
        onClick={() => closeMenu()}
      />

      <div
        ref={panelRef}
        id="mobile-admin-navigation"
        className="mobile-admin-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-label="CRM navigation"
        aria-hidden={!isOpen}
        inert={!isOpen}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }}
        onPointerDown={(event) => beginDrag("closing", event)}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
      >
        <div className="mobile-admin-menu-heading">
          <span>TruShot Media</span>
          <strong>CRM workspace</strong>
        </div>
        <AdminNavigation onNavigate={() => closeMenu(false)} />
        <span className="mobile-admin-menu-grip" aria-hidden="true" />
      </div>
    </div>
  );
}
