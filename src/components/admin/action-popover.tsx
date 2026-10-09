"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ActionPopoverProps = {
  action: (formData: FormData) => Promise<unknown>;
  children: ReactNode;
  summary: ReactNode;
  title: string;
  formClassName?: string;
  detailsClassName?: string;
  summaryClassName?: string;
};

const dialogControls = [
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ActionPopover({
  action,
  children,
  summary,
  title,
  formClassName = "quick-form",
  detailsClassName = "action-popover",
  summaryClassName = "admin-primary-button",
}: ActionPopoverProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const isRowEditor = detailsClassName.split(" ").includes("row-editor");

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      const firstField = formRef.current?.querySelector<HTMLElement>("input:not([type='hidden']), select, textarea");
      (firstField ?? formRef.current?.querySelector<HTMLElement>(dialogControls))?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function close(restoreFocus = true) {
    if (detailsRef.current) detailsRef.current.open = false;
    setIsOpen(false);
    formRef.current?.reset();
    setErrorMessage("");
    if (restoreFocus) {
      window.requestAnimationFrame(() => detailsRef.current?.querySelector<HTMLElement>("summary")?.focus());
    }
  }

  async function submit(formData: FormData) {
    setErrorMessage("");
    try {
      await action(formData);
      close();
    } catch {
      setErrorMessage("This change could not be saved. Review the fields and try again.");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key === "Escape") close();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDetailsElement>) {
    if (event.target === event.currentTarget) close();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !formRef.current) return;
    const controls = Array.from(formRef.current.querySelectorAll<HTMLElement>(dialogControls));
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

  const form = (
    <form ref={formRef} action={submit} className={formClassName} role="dialog" aria-modal="true" aria-label={title} onKeyDown={handleDialogKeyDown}>
      <h3>{title}</h3>
      <button type="button" className="popover-close-button" aria-label={`Close ${title}`} onClick={() => close()}><X size={16} /></button>
      {children}
      {errorMessage ? <p className="popover-error form-span" role="alert">{errorMessage}</p> : null}
    </form>
  );

  return (
    <>
    <details
      ref={detailsRef}
      className={detailsClassName}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        setIsOpen(open);
        if (!open) {
          formRef.current?.reset();
          setErrorMessage("");
        }
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {!isRowEditor ? form : null}
    </details>
    {isRowEditor && isOpen && typeof document !== "undefined" ? createPortal(
      <div className="row-editor-layer">
        <button type="button" className="row-editor-backdrop" aria-label={`Close ${title}`} onClick={() => close()} />
        {form}
      </div>, document.body,
    ) : null}
    </>
  );
}
