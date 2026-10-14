"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { BriefcaseBusiness, CalendarPlus2, FilePlus2, ListTodo, LoaderCircle, X } from "lucide-react";
import { createJob, createTask, updateCalendarItem } from "@/app/admin/actions";
import { JobSearchField } from "@/components/admin/job-search-field";
import type { CalendarItem, JobSearchOption, JobStatus, SelectOption, TaskStatus } from "@/lib/types";

export type TabletCreateKind = "event" | "job" | "task";

type CreateEditorProps = {
  clientOptions: SelectOption[];
  defaultDate: string;
  jobOptions: JobSearchOption[];
  jobStatuses: JobStatus[];
  kind: Exclude<TabletCreateKind, "event">;
  onClose: () => void;
  onCreated: () => void;
  taskStatuses: TaskStatus[];
};

function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
}

export function TabletRecordCreateEditor({ clientOptions, defaultDate, jobOptions, jobStatuses, kind, onClose, onCreated, taskStatuses }: CreateEditorProps) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  useEscapeToClose(onClose);

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !saving) onClose();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    try {
      const formData = new FormData(event.currentTarget);
      if (kind === "job") await createJob(formData);
      else await createTask(formData);
      onCreated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `The ${kind} could not be created.`);
    } finally {
      setSaving(false);
    }
  }

  const title = kind === "job" ? "Create a job" : "Create a task / asset";
  return (
    <div className="calendar-editor-backdrop tablet-editor-backdrop" onClick={handleBackdropClick} role="presentation">
      <form className="calendar-editor tablet-record-editor" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="tablet-record-editor-title">
        <header>
          <div>
            <span>{kind === "job" ? <BriefcaseBusiness size={13} /> : <ListTodo size={13} />} Tablet editing</span>
            <h2 id="tablet-record-editor-title">{title}</h2>
            <p>{kind === "job" ? "Add production work without leaving the kiosk." : "Add an asset and attach it to an existing job."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${kind} editor`} disabled={saving}><X size={17} /></button>
        </header>

        {kind === "job" ? (
          <div className="tablet-record-editor-fields">
            <label className="form-span">Job title<input name="title" required minLength={2} maxLength={200} autoFocus /></label>
            <label>Client<select name="client_id" defaultValue=""><option value="">No client yet</option>{clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            <label>Status<select name="status_id" required defaultValue={jobStatuses[0]?.id}>{jobStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            <label>Shoot date<input name="shoot_date" type="date" defaultValue={defaultDate} /></label>
            <label>Shoot time<input name="shoot_time" type="time" /></label>
            <label>Due date<input name="due_date" type="date" min={defaultDate || undefined} /></label>
            <label>Due time<input name="due_time" type="time" /></label>
            <label>Photos delivered<input name="photos_delivered" type="number" min="0" defaultValue="0" /></label>
          </div>
        ) : (
          <div className="tablet-record-editor-fields">
            <label className="form-span">Title<input name="title" required minLength={2} maxLength={220} autoFocus /></label>
            <JobSearchField jobs={jobOptions} />
            <label>Status<select name="status_id" required defaultValue={taskStatuses[0]?.id}>{taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            <label>Asset type<select name="asset_type" defaultValue="Asset" required><option value="Asset">Asset</option><option value="Other">Other</option></select></label>
            <label>Hours<input name="hours" type="number" min="0" step="0.25" inputMode="decimal" /></label>
            <label>Due time<input name="due_time" type="time" /></label>
            <label>Priority<select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="form-span">Description<textarea name="description" rows={3} maxLength={2000} /></label>
          </div>
        )}

        {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
        <footer>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="admin-primary-button" type="submit" disabled={saving || (kind === "job" ? !jobStatuses.length : !taskStatuses.length || !jobOptions.length)}>
            {saving ? <><LoaderCircle className="spin" size={14} /> Creating…</> : <><FilePlus2 size={14} /> Create {kind === "job" ? "job" : "asset"}</>}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function TabletScheduleEditor({ item, onClose, onSaved }: { item: CalendarItem; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  useEscapeToClose(onClose);

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !saving) onClose();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    try {
      await updateCalendarItem(new FormData(event.currentTarget));
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The schedule could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="calendar-editor-backdrop tablet-editor-backdrop" onClick={handleBackdropClick} role="presentation">
      <form className="calendar-editor tablet-record-editor" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="tablet-schedule-editor-title">
        <header>
          <div><span><CalendarPlus2 size={13} /> {item.entity_type === "job" ? "Job schedule" : item.entity_type === "campaign-asset" ? "Campaign asset schedule" : "Task deadline"}</span><h2 id="tablet-schedule-editor-title">{item.title}</h2><p>{item.status_label}{item.entity_type === "campaign-asset" ? ` · ${item.campaign_title}` : ""}{item.client_name ? ` · ${item.client_name}` : ""}</p></div>
          <button type="button" onClick={onClose} aria-label="Close schedule editor" disabled={saving}><X size={17} /></button>
        </header>
        <input type="hidden" name="entity_type" value={item.entity_type} />
        <input type="hidden" name="id" value={item.id} />
        {item.entity_type === "job" ? (
          <div className="tablet-record-editor-fields">
            <label>Job start / production date<input type="date" name="shoot_date" defaultValue={item.shoot_date ?? ""} /></label>
            <label>Start time<input type="time" name="shoot_time" defaultValue={item.shoot_time?.slice(0, 5) ?? ""} /></label>
            <label>Job deadline<input type="date" name="due_date" defaultValue={item.due_date ?? ""} /></label>
            <label>Deadline time<input type="time" name="due_time" defaultValue={item.due_time?.slice(0, 5) ?? ""} /></label>
          </div>
        ) : item.entity_type === "campaign-asset" ? (
          <div className="tablet-record-editor-fields">
            <label>Asset start date<input type="date" name="start_date" defaultValue={item.start_date ?? ""} /></label>
            <label>Start time<input type="time" name="start_time" defaultValue={item.start_time?.slice(0, 5) ?? ""} /></label>
            <label>Asset deadline<input type="date" name="due_date" defaultValue={item.due_date ?? ""} /></label>
            <label>Deadline time<input type="time" name="due_time" defaultValue={item.due_time?.slice(0, 5) ?? ""} /></label>
            <label>Priority<select name="priority" defaultValue={item.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          </div>
        ) : (
          <div className="tablet-record-editor-fields">
            <label>Inherited job deadline<input type="date" value={item.due_date ?? ""} readOnly disabled /><small>Change the job deadline to update its related tasks.</small></label>
            <label>Deadline time<input type="time" name="due_time" defaultValue={item.due_time?.slice(0, 5) ?? ""} /></label>
            <label>Priority<select name="priority" defaultValue={item.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          </div>
        )}
        {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
        <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : "Save schedule"}</button></footer>
      </form>
    </div>
  );
}
