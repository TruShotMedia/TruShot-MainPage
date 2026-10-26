"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, LoaderCircle, RotateCcw, X } from "lucide-react";
import { delayJob, delayTask } from "@/app/admin/actions";

type DelayRecordActionProps = {
  kind: "job" | "task";
  recordId: string;
  recordTitle: string;
  scheduledDate: string | null;
  compact?: boolean;
  onDelayed?: () => void;
};

/** A portal dialog so it can safely be used from existing record editor forms. */
export function DelayRecordAction({ kind, recordId, recordTitle, scheduledDate, compact = false, onDelayed }: DelayRecordActionProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const dateLabel = kind === "job" ? "New shoot date" : "New due date";
  const entityLabel = kind === "job" ? "job" : "task";

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("#delay-record-date")?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  function close() {
    if (saving) return;
    setOpen(false);
    setErrorMessage("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    try {
      const formData = new FormData(event.currentTarget);
      await (kind === "job" ? delayJob : delayTask)(formData);
      setOpen(false);
      onDelayed?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `This ${entityLabel} could not be delayed.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={compact ? "tablet-delay-record-button" : "status-row-delay"}
        onClick={() => setOpen(true)}
        title={`Delay ${recordTitle}`}
        aria-label={`Delay ${recordTitle}`}
      >
        <RotateCcw size={compact ? 14 : 15} />
        {!compact ? "Delay" : null}
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="delay-record-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <form className="delay-record-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby={headingId}>
            <header>
              <span><CalendarClock size={15} /> Reschedule</span>
              <button type="button" onClick={close} aria-label="Close delay dialog" disabled={saving}><X size={18} /></button>
            </header>
            <h2 id={headingId}>Delay this {entityLabel}</h2>
            <p>The current record will be retained as <strong>Delayed</strong>. A linked, ready-to-action successor will be scheduled on the new date.</p>
            <input type="hidden" name="id" value={recordId} />
            <div className="delay-record-fields">
              <label>
                {dateLabel}
                <input id="delay-record-date" name="rescheduled_date" type="date" defaultValue={scheduledDate ?? ""} required />
              </label>
              <label>
                Why is it delayed?
                <textarea name="reason" rows={4} maxLength={4000} minLength={2} required placeholder="e.g. Client moved the shoot due to weather." />
              </label>
            </div>
            <aside><RotateCcw size={15} /> Every later delay remains attached to this history chain.</aside>
            {errorMessage ? <p className="delay-record-error" role="alert">{errorMessage}</p> : null}
            <footer>
              <button type="button" onClick={close} disabled={saving}>Cancel</button>
              <button className="admin-primary-button" type="submit" disabled={saving}>
                {saving ? <><LoaderCircle className="spin" size={15} /> Rescheduling…</> : <><RotateCcw size={15} /> Submit delay</>}
              </button>
            </footer>
          </form>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
