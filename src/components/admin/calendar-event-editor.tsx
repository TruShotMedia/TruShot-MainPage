"use client";

import { useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { BellRing, CalendarPlus2, LoaderCircle, MapPin, Trash2, X } from "lucide-react";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "@/app/admin/actions";
import type { CalendarCustomEvent } from "@/lib/types";

const reminderOptions = [
  { value: 1440, label: "1 day before" },
  { value: 120, label: "2 hours before" },
  { value: 60, label: "1 hour before" },
  { value: 30, label: "30 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 0, label: "At start time" },
];

const eventColors = ["#1f5e41", "#3975ad", "#9b5d39", "#74558f", "#b54d45", "#68706a"];

type CalendarEventEditorProps = {
  event: CalendarCustomEvent | null;
  defaultDate: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onSaved: (event: CalendarCustomEvent) => void;
};

export function CalendarEventEditor({ event, defaultDate, onClose, onDeleted, onSaved }: CalendarEventEditorProps) {
  const [allDay, setAllDay] = useState(event?.is_all_day ?? false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const defaultStartTime = event?.start_time?.slice(0, 5) ?? "09:00";
  const defaultEndTime = event?.end_time?.slice(0, 5) ?? "10:00";

  function handleBackdropClick(clickEvent: MouseEvent<HTMLDivElement>) {
    if (clickEvent.target === clickEvent.currentTarget) onClose();
  }

  async function save(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setSaving(true);
    setErrorMessage("");
    try {
      const formData = new FormData(submitEvent.currentTarget);
      const saved = event ? await updateCalendarEvent(formData) : await createCalendarEvent(formData);
      onSaved(saved as CalendarCustomEvent);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The event could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event || !window.confirm(`Delete “${event.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.set("id", event.id);
      await deleteCalendarEvent(formData);
      onDeleted(event.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The event could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="calendar-editor-backdrop" onClick={handleBackdropClick} role="presentation">
      <form className="calendar-editor calendar-event-editor" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="calendar-event-editor-title">
        <header>
          <div>
            <span><CalendarPlus2 size={13} /> {event ? "Edit calendar event" : "New calendar event"}</span>
            <h2 id="calendar-event-editor-title">{event?.title ?? "Add something to your schedule"}</h2>
            <p>Set an exact window and choose when native push reminders should arrive.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close event editor"><X size={17} /></button>
        </header>

        {event ? <input type="hidden" name="id" value={event.id} /> : null}
        <div className="calendar-event-editor-fields">
          <label className="calendar-event-title-field">Event title<input name="title" required minLength={2} maxLength={180} defaultValue={event?.title ?? ""} placeholder="e.g. Campaign planning session" /></label>
          <label><MapPin size={13} /> Location<input name="location" maxLength={300} defaultValue={event?.location ?? ""} placeholder="Studio, address or video call" /></label>
          <label className="calendar-event-notes-field">Notes<textarea name="description" maxLength={4000} defaultValue={event?.description ?? ""} placeholder="People, preparation, links or anything useful…" /></label>
        </div>

        <section className="calendar-event-time-panel">
          <label className="calendar-event-all-day"><span><strong>All-day event</strong><small>Hide times and reserve whole days.</small></span><input type="checkbox" name="is_all_day" checked={allDay} onChange={(changeEvent) => setAllDay(changeEvent.target.checked)} /></label>
          <div>
            <label>Starts<input type="date" name="start_date" required defaultValue={event?.start_date ?? defaultDate} /></label>
            {!allDay ? <label>Start time<input type="time" name="start_time" required defaultValue={defaultStartTime} /></label> : null}
            <label>Finishes<input type="date" name="end_date" required defaultValue={event?.end_date ?? defaultDate} /></label>
            {!allDay ? <label>Finish time<input type="time" name="end_time" required defaultValue={defaultEndTime} /></label> : null}
          </div>
        </section>

        <section className="calendar-event-options-grid">
          <fieldset className="calendar-event-colors">
            <legend>Calendar colour</legend>
            <div>{eventColors.map((color) => <label key={color} style={{ "--event-choice-color": color } as CSSProperties}><input type="radio" name="color" value={color} defaultChecked={(event?.color ?? eventColors[0]) === color} /><span /></label>)}</div>
          </fieldset>
          <fieldset className="calendar-event-reminders">
            <legend><BellRing size={13} /> Push reminders</legend>
            <div>{reminderOptions.map((option) => <label key={option.value}><input type="checkbox" name="reminder_offsets_minutes" value={option.value} defaultChecked={event ? event.reminder_offsets_minutes.includes(option.value) : [60, 0].includes(option.value)} /><span>{option.label}</span></label>)}</div>
            <small>Alerts go to devices that have notifications enabled in CRM Settings.</small>
          </fieldset>
        </section>

        {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
        <footer>
          {event ? <button className="calendar-event-delete" type="button" onClick={remove} disabled={saving || deleting}>{deleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Delete</button> : null}
          <span />
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="admin-primary-button" type="submit" disabled={saving || deleting}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : event ? "Save event" : "Create event"}</button>
        </footer>
      </form>
    </div>
  );
}
