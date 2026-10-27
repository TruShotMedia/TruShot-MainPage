"use client";

import { useEffect, useRef, type FormEventHandler, type ReactNode } from "react";

const openDialogs = new Set<HTMLElement>();
let originalBodyOverflow = "";

type WorkspaceDialogProps = {
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  footer?: ReactNode;
  header: ReactNode;
  onClose: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  busy?: boolean;
  titleId: string;
};

/** One constrained surface, one scroll region, and always-reachable actions. */
export function WorkspaceDialog({ backdropClassName = "", busy = false, children, className = "", footer, header, onClose, onSubmit, titleId }: WorkspaceDialogProps) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const latest = useRef({ onClose, busy });
  useEffect(() => { latest.current = { onClose, busy }; }, [onClose, busy]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!openDialogs.size) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogs.add(surface);
    const viewport = window.visualViewport;
    const backdrop = surface.parentElement;
    const fitKeyboard = () => {
      if (viewport && window.matchMedia("(max-width: 760px), (max-height: 760px) and (pointer: coarse)").matches) backdrop?.style.setProperty("--workspace-visual-height", `${viewport.height}px`);
    };
    fitKeyboard();
    viewport?.addEventListener("resize", fitKeyboard);
    // Focus the surface, not an input: opening a sheet must not launch the iOS keyboard.
    surface.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if ([...openDialogs].at(-1) !== surface) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!latest.current.busy) latest.current.onClose();
      }
      if (event.key !== "Tab") return;
      const controls = [...surface!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((element) => !element.closest("[hidden], [inert]"));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === surface)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !surface!.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      viewport?.removeEventListener("resize", fitKeyboard);
      openDialogs.delete(surface);
      if (!openDialogs.size) document.body.style.overflow = originalBodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const content = <><header className="workspace-dialog-header">{header}</header><div className="workspace-dialog-body">{children}</div>{footer ? <footer className="workspace-dialog-footer">{footer}</footer> : null}</>;
  const shared = { className: `calendar-editor workspace-dialog ${className}`, role: "dialog" as const, "aria-modal": true as const, "aria-labelledby": titleId, "aria-busy": busy, tabIndex: -1 };

  return (
    <div className={`calendar-editor-backdrop tablet-editor-backdrop workspace-dialog-backdrop ${backdropClassName}`} role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      {onSubmit ? <form {...shared} ref={(node) => { surfaceRef.current = node; }} onInvalidCapture={(event)=>{let parent:HTMLElement|null=event.target as HTMLElement;while(parent&&parent!==surfaceRef.current){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}}} onSubmit={(event) => { event.stopPropagation(); onSubmit(event); }}>{content}</form> : <section {...shared} ref={(node) => { surfaceRef.current = node; }}>{content}</section>}
    </div>
  );
}
