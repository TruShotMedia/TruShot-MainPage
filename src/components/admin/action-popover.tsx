"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
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

  function close() {
    if (detailsRef.current) detailsRef.current.open = false;
    formRef.current?.reset();
    setErrorMessage("");
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

  return (
    <details
      ref={detailsRef}
      className={detailsClassName}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onToggle={(event) => {
        if (!event.currentTarget.open) {
          formRef.current?.reset();
          setErrorMessage("");
        }
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      <form ref={formRef} action={submit} className={formClassName} role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <button type="button" className="popover-close-button" aria-label={`Close ${title}`} onClick={close}><X size={16} /></button>
        {children}
        {errorMessage ? <p className="popover-error form-span" role="alert">{errorMessage}</p> : null}
      </form>
    </details>
  );
}
