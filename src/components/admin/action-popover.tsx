"use client";

import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";

type ActionPopoverProps = {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  summary: ReactNode;
  title: string;
  formClassName?: string;
};

export function ActionPopover({ action, children, summary, title, formClassName = "quick-form" }: ActionPopoverProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function close() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  async function submit(formData: FormData) {
    await action(formData);
    formRef.current?.reset();
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key === "Escape") close();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDetailsElement>) {
    if (event.target === event.currentTarget) close();
  }

  return (
    <details ref={detailsRef} className="action-popover" onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <summary className="admin-primary-button">{summary}</summary>
      <form ref={formRef} action={submit} className={formClassName}>
        <h3>{title}</h3>
        <button type="button" className="popover-close-button" aria-label={`Close ${title}`} onClick={close}><X size={16} /></button>
        {children}
      </form>
    </details>
  );
}
