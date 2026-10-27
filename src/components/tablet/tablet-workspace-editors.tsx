"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, CalendarPlus2, FilePlus2, Images, Link2, ListChecks, ListTodo, LoaderCircle, MapPin, MessageSquareText, PencilLine, Save, SendHorizontal, Trash2, X } from "lucide-react";
import { archiveJob, archiveTask, createJob, createTask, saveWorkRecordNote, updateCalendarItem, updateTabletJob, updateTask } from "@/app/admin/actions";
import { DelayRecordAction } from "@/components/admin/delay-record-action";
import { DelayHistoryBanner } from "@/components/admin/delay-history-banner";
import { JobSearchField } from "@/components/admin/job-search-field";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";
import { formatDate } from "@/lib/format";
import type { CalendarItem, JobSearchOption, JobStatus, PipelineTask, SelectOption, TabletJobRecord, TaskStatus, WorkRecordNote } from "@/lib/types";

export type TabletCreateKind = "event" | "flight" | "job" | "task";

type CreateEditorProps = {
  fixedClientId?: string;
  clientOptions: SelectOption[];
  defaultDate: string;
  jobOptions: JobSearchOption[];
  jobStatuses: JobStatus[];
  kind: Exclude<TabletCreateKind, "event" | "flight">;
  onClose: () => void;
  onCreated: () => void;
  sourceRecord?: TabletJobRecord | PipelineTask;
  taskStatuses: TaskStatus[];
};

function isJobRecord(record: TabletJobRecord | PipelineTask): record is TabletJobRecord {
  return "photos_delivered" in record;
}

function formatTabletTime(value: string | null) {
  if (!value) return "Time not set";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes));
}

function formatNoteTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function RecordNotesPanel({ legacyNote, notes = [], recordId, recordKind }: { legacyNote?: string | null; notes?: WorkRecordNote[]; recordId: string; recordKind: "job" | "task" }) {
  const [items, setItems] = useState<WorkRecordNote[]>(notes);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const hasLegacyFallback = !items.length && Boolean(legacyNote?.trim());

  async function saveNote(noteId?: string) {
    const body = (noteId ? editingBody : draft).trim();
    if (!body) {
      setErrorMessage("Write a note before saving it.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.set("record_kind", recordKind);
      formData.set("record_id", recordId);
      formData.set("body", body);
      if (noteId) formData.set("note_id", noteId);
      const saved = await saveWorkRecordNote(formData);
      setItems((current) => noteId
        ? current.map((item) => item.id === noteId ? saved : item)
        : [...current, saved],
      );
      setDraft("");
      setEditingId(null);
      setEditingBody("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The note could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="tablet-record-notes" aria-label="Internal notes">
      <header>
        <div><span><MessageSquareText size={14} /> Internal notes</span><p>Private working context for this {recordKind}.</p></div>
        <b>{items.length}</b>
      </header>
      <div className="tablet-record-notes-thread" aria-live="polite">
        {hasLegacyFallback ? <article className="tablet-record-note is-legacy"><small>Imported note</small><p>{legacyNote}</p></article> : null}
        {items.length ? items.map((note) => (
          <article className="tablet-record-note" key={note.id}>
            <header><small>{note.rescheduled_date ? `Rescheduled to ${formatDate(note.rescheduled_date)} · ` : ""}{formatNoteTimestamp(note.created_at)}{note.updated_at !== note.created_at ? " · Edited" : ""}</small><button type="button" onClick={() => { setEditingId(note.id); setEditingBody(note.body); setErrorMessage(""); }} aria-label="Edit this note"><PencilLine size={13} /></button></header>
            {editingId === note.id ? (
              <div className="tablet-record-note-edit">
                <textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} maxLength={4000} rows={4} disabled={saving} autoFocus />
                <div><button type="button" onClick={() => { setEditingId(null); setEditingBody(""); }} disabled={saving}>Cancel</button><button type="button" className="admin-primary-button" onClick={() => { void saveNote(note.id); }} disabled={saving}>{saving ? "Saving…" : "Save note"}</button></div>
              </div>
            ) : <p>{note.body}</p>}
          </article>
        )) : !hasLegacyFallback ? <div className="tablet-record-notes-empty"><MessageSquareText size={17} /><strong>No internal notes yet</strong><span>Capture context, decisions or handover details here.</span></div> : null}
      </div>
      <div className="tablet-record-note-compose">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={4} placeholder="Add an internal note…" disabled={saving} />
        <button type="button" onClick={() => { void saveNote(); }} disabled={saving || !draft.trim()}><SendHorizontal size={14} /> {saving ? "Saving" : "Add note"}</button>
      </div>
      {errorMessage ? <p className="tablet-record-note-error" role="alert">{errorMessage}</p> : null}
    </aside>
  );
}

export function TabletJobDetailSheet({ job, onClose, isAutopacific = false }: { job: TabletJobRecord; onClose: () => void; isAutopacific?: boolean }) {
  return (
      <WorkspaceDialog className="tablet-job-detail-sheet" titleId="tablet-job-detail-title" onClose={onClose} header={<>
          <div>
            <span><BriefcaseBusiness size={13} /> Job details</span>
            <h2 id="tablet-job-detail-title">{job.title}</h2>
            <p>{job.client?.name ?? "No client"}{job.status ? ` · ${job.status.label}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close job details"><X size={17} /></button>
        </>} footer={<>
          {job.delivery_url ? <a className="tablet-job-delivery-link" href={job.delivery_url} target="_blank" rel="noreferrer"><Link2 size={14} /> Open client files <ArrowUpRight size={13} /></a> : <span />}
          <button className="admin-primary-button" type="button" onClick={onClose}>Done</button>
        </>}>

        <DelayHistoryBanner delayInfo={job.delay_info} />

        <div className="tablet-job-detail-summary">
          <article>
            <span><CalendarDays size={15} /> Shoot</span>
            <strong>{formatDate(job.shoot_date)}</strong>
            <small>{formatTabletTime(job.shoot_time)}</small>
          </article>
          <article>
            <span><CalendarDays size={15} /> Due</span>
            <strong>{formatDate(job.due_date)}</strong>
            <small>{formatTabletTime(job.due_time)}</small>
          </article>
          <article>
            <span><ListChecks size={15} /> Assets</span>
            <strong>{job.open_tasks} open</strong>
            <small>{job.total_tasks} total tasks</small>
          </article>
          {!isAutopacific ? <article>
            <span><Images size={15} /> Photos</span>
            <strong>{job.photos_delivered}</strong>
            <small>Delivered</small>
          </article> : null}
        </div>

        <dl className="tablet-job-detail-list">
          {!isAutopacific ? <div><dt>Job number</dt><dd>{job.job_number || "Not assigned"}</dd></div> : null}
          <div><dt><MapPin size={14} /> Location</dt><dd>{job.location || "Not specified"}</dd></div>
          {job.description ? <div className="is-wide"><dt>Description</dt><dd>{job.description}</dd></div> : null}
          {job.key_deliverables?.length ? <div className="is-wide"><dt>Key deliverables</dt><dd><ul className="job-deliverables-list">{job.key_deliverables.map((item, index) => <li key={index}>{item}</li>)}</ul></dd></div> : null}
          {job.record_notes?.length ? <div className="is-wide"><dt>Internal notes</dt><dd>{job.record_notes.map((note) => `${formatNoteTimestamp(note.created_at)} — ${note.body}`).join("\n\n")}</dd></div> : job.notes ? <div className="is-wide"><dt>Internal notes</dt><dd>{job.notes}</dd></div> : null}
        </dl>

      </WorkspaceDialog>
  );
}

export function TabletTaskDetailSheet({ task, onClose }: { task: PipelineTask; onClose: () => void }) {
  return (
      <WorkspaceDialog className="tablet-job-detail-sheet tablet-task-detail-sheet" titleId="tablet-task-detail-title" onClose={onClose} header={<>
          <div>
            <span><ListTodo size={13} /> Task details</span>
            <h2 id="tablet-task-detail-title">{task.title}</h2>
            <p>{task.job?.client?.name ?? "No client"}{task.job?.title ? ` · ${task.job.title}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close task details"><X size={17} /></button>
        </>} footer={<button className="admin-primary-button" type="button" onClick={onClose}>Done</button>}>

        <DelayHistoryBanner delayInfo={task.delay_info} />

        <div className="tablet-job-detail-summary tablet-task-detail-summary">
          <article>
            <span><CalendarDays size={15} /> Due</span>
            <strong>{formatDate(task.due_date)}</strong>
            <small>{formatTabletTime(task.due_time)}</small>
          </article>
          <article>
            <span><ListChecks size={15} /> Priority</span>
            <strong>{task.priority}</strong>
            <small>Production focus</small>
          </article>
          <article>
            <span><ListTodo size={15} /> Type</span>
            <strong>{task.asset_type ?? "Asset"}</strong>
            <small>Work item</small>
          </article>
          <article>
            <span><CalendarDays size={15} /> Hours</span>
            <strong>{task.hours == null ? "Unset" : `${task.hours}h`}</strong>
            <small>Planned effort</small>
          </article>
        </div>

        <dl className="tablet-job-detail-list">
          <div><dt>Attached job</dt><dd>{task.job?.title ?? "Unlinked job"}</dd></div>
          <div><dt>Task status</dt><dd>{task.completed_at ? "Completed" : "Active"}</dd></div>
          {task.description ? <div className="is-wide"><dt>Description</dt><dd>{task.description}</dd></div> : null}
          {task.record_notes?.length ? <div className="is-wide"><dt>Internal notes</dt><dd>{task.record_notes.map((note) => `${formatNoteTimestamp(note.created_at)} — ${note.body}`).join("\n\n")}</dd></div> : null}
        </dl>

      </WorkspaceDialog>
  );
}

export function TabletRecordCreateEditor({ clientOptions, defaultDate, fixedClientId, jobOptions, jobStatuses, kind, onClose, onCreated, sourceRecord, taskStatuses }: CreateEditorProps) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const sourceJob = kind === "job" && sourceRecord && isJobRecord(sourceRecord) ? sourceRecord : null;
  const sourceTask = kind === "task" && sourceRecord && !isJobRecord(sourceRecord) ? sourceRecord : null;
  const isDuplicate = Boolean(sourceJob || sourceTask);

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

  const title = isDuplicate ? `Duplicate this ${kind === "job" ? "job" : "task / asset"}` : kind === "job" ? "Create a job" : "Create a task / asset";
  const defaultClientId = sourceJob?.client_id ?? (clientOptions.length === 1 ? clientOptions[0].id : "");
  const defaultJobStatusId = sourceJob && jobStatuses.some((status) => status.id === sourceJob.status_id) ? sourceJob.status_id : jobStatuses[0]?.id;
  const defaultTaskStatusId = sourceTask && taskStatuses.some((status) => status.id === sourceTask.status_id) ? sourceTask.status_id : taskStatuses[0]?.id;
  const taskPriority = sourceTask && ["low", "normal", "high", "urgent"].includes(sourceTask.priority) ? sourceTask.priority : "normal";
  return (
      <WorkspaceDialog className="tablet-record-editor is-create-editor" onSubmit={save} busy={saving} titleId="tablet-record-editor-title" onClose={onClose} header={<>
          <div>
            <span>{kind === "job" ? <BriefcaseBusiness size={13} /> : <ListTodo size={13} />} {kind === "job" ? "Job workspace" : "Asset workspace"}</span>
            <h2 id="tablet-record-editor-title">{title}</h2>
            <p>{isDuplicate ? "Review the copied details, make any changes, then create the new record." : kind === "job" ? "Add production work without leaving the kiosk." : "Add an asset and attach it to an existing job."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${kind} editor`} disabled={saving}><X size={17} /></button>
        </>} footer={<>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="admin-primary-button" type="submit" disabled={saving || (kind === "job" ? !jobStatuses.length : !taskStatuses.length || !jobOptions.length)}>
            {saving ? <><LoaderCircle className="spin" size={14} /> Creating…</> : <><FilePlus2 size={14} /> {isDuplicate ? "Create duplicate" : `Create ${kind === "job" ? "job" : "asset"}`}</>}
          </button>
        </>}>

        {kind === "job" ? (
          <div className="tablet-record-editor-fields">
            <div className="workspace-form-section"><strong>Job details</strong><p>What you’re creating and who it’s for.</p></div>
            <label className="form-span">Job title<input name="title" required minLength={2} maxLength={200} defaultValue={sourceJob?.title ?? ""} /></label>
            {fixedClientId ? <input type="hidden" name="client_id" value={fixedClientId} /> : <label>Client<select name="client_id" defaultValue={defaultClientId}><option value="">No client yet</option>{clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
            <label>Status<select name="status_id" required defaultValue={defaultJobStatusId}>{jobStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            <div className="workspace-form-section"><strong>Schedule</strong><p>Production timing and the delivery deadline.</p></div>
            <label>Shoot date<input name="shoot_date" type="date" defaultValue={sourceJob?.shoot_date ?? defaultDate} /></label>
            <label>Shoot time<input name="shoot_time" type="time" defaultValue={sourceJob?.shoot_time?.slice(0, 5) ?? ""} /></label>
            <label>Due date<input name="due_date" type="date" min={(sourceJob?.shoot_date ?? defaultDate) || undefined} defaultValue={sourceJob?.due_date ?? ""} /></label>
            <label>Due time<input name="due_time" type="time" defaultValue={sourceJob?.due_time?.slice(0, 5) ?? ""} /></label>
            <div className="workspace-form-section"><strong>Production & delivery</strong><p>Keep location, files and context together.</p></div>
            {fixedClientId ? <input type="hidden" name="photos_delivered" value="0" /> : <label>Photos delivered<input name="photos_delivered" type="number" min="0" defaultValue="0" /></label>}
            <label className="form-span">Location<input name="location" maxLength={300} defaultValue={sourceJob?.location ?? ""} /></label>
            <label className="form-span">Client delivery link<input name="delivery_url" type="url" inputMode="url" maxLength={2048} autoCapitalize="none" autoCorrect="off" placeholder="https://drive.google.com/…" defaultValue={sourceJob?.delivery_url ?? ""} /></label>
            <label className="form-span">Description<textarea name="description" rows={3} maxLength={2000} defaultValue={sourceJob?.description ?? ""} /></label>
            <label className="form-span">Key deliverables<textarea name="key_deliverables" rows={4} maxLength={10000} placeholder={"30-second launch video\n5 product photographs\n3 vertical social clips"} defaultValue={sourceJob?.key_deliverables?.join("\n") ?? ""} /><small>One deliverable per line. Shown as a bullet list in job details.</small></label>
            <label className="form-span">Internal notes<textarea name="notes" rows={3} maxLength={4000} defaultValue={sourceJob?.notes ?? ""} /></label>
          </div>
        ) : (
          <div className="tablet-record-editor-fields">
            <div className="workspace-form-section"><strong>Asset details</strong><p>Name the deliverable and link it to a job.</p></div>
            <label className="form-span">Title<input name="title" required minLength={2} maxLength={220} defaultValue={sourceTask?.title ?? ""} /></label>
            <JobSearchField jobs={jobOptions} defaultJobId={sourceTask?.job_id} />
            <label>Status<select name="status_id" required defaultValue={defaultTaskStatusId}>{taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            <label>Asset type<select name="asset_type" defaultValue={sourceTask?.asset_type === "Other" ? "Other" : "Asset"} required><option value="Asset">Asset</option><option value="Other">Other</option></select></label>
            <div className="workspace-form-section"><strong>Production</strong><p>Effort, timing and priority.</p></div>
            <label>Hours<input name="hours" type="number" min="0" step="0.25" inputMode="decimal" defaultValue={sourceTask?.hours ?? ""} /></label>
            <label>Due time<input name="due_time" type="time" defaultValue={sourceTask?.due_time?.slice(0, 5) ?? ""} /></label>
            <label>Priority<select name="priority" defaultValue={taskPriority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="form-span">Description<textarea name="description" rows={3} maxLength={2000} defaultValue={sourceTask?.description ?? ""} /></label>
          </div>
        )}

        {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
      </WorkspaceDialog>
  );
}

type EditEditorProps = {
  fixedClientId?: string;
  clientOptions: SelectOption[];
  jobOptions: JobSearchOption[];
  jobStatuses: JobStatus[];
  onClose: () => void;
  onSaved: () => void;
  record: TabletJobRecord | PipelineTask;
  taskStatuses: TaskStatus[];
  type: "job" | "task";
};

export function TabletRecordEditEditor({ clientOptions, fixedClientId, jobOptions, jobStatuses, onClose, onSaved, record, taskStatuses, type }: EditEditorProps) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isJob = type === "job";
  const job = isJob ? record as TabletJobRecord : null;
  const task = !isJob ? record as PipelineTask : null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    try {
      const formData = new FormData(event.currentTarget);
      if (isJob) await updateTabletJob(formData);
      else await updateTask(formData);
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `The ${isJob ? "job" : "task"} could not be saved.`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const label = isJob ? "job and its related task records" : "task";
    if (!window.confirm(`Remove this ${label} from the active CRM? This keeps an archived copy of the data.`)) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.set("id", record.id);
      if (isJob) await archiveJob(formData);
      else await archiveTask(formData);
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `The ${isJob ? "job" : "task"} could not be removed.`);
    } finally {
      setSaving(false);
    }
  }

  return (
      <WorkspaceDialog className="tablet-record-editor is-edit-editor" onSubmit={save} busy={saving} titleId="tablet-record-edit-title" onClose={onClose} header={<>
          <div>
            <span>{isJob ? <BriefcaseBusiness size={13} /> : <ListTodo size={13} />} {isJob ? "Job workspace" : "Asset workspace"}</span>
            <h2 id="tablet-record-edit-title">Edit {record.title}</h2>
            <p>{isJob ? "Update the job, its schedule and delivery details." : "Update this asset, its job, status and production details."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${isJob ? "job" : "task"} editor`} disabled={saving}><X size={17} /></button>
        </>} footer={<>
          <button type="button" className="tablet-delete-record" onClick={() => { void remove(); }} disabled={saving}><Trash2 size={14} /> Delete</button>
          {job && !job.status?.is_closed ? <DelayRecordAction compact kind="job" recordId={job.id} recordTitle={job.title} scheduledDate={job.shoot_date ?? job.due_date} onDelayed={onSaved} /> : null}
          {task && taskStatuses.find((status) => status.id === task.status_id)?.is_open !== false ? <DelayRecordAction compact kind="task" recordId={task.id} recordTitle={task.title} scheduledDate={task.due_date} onDelayed={onSaved} /> : null}
          <span />
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : <><Save size={14} /> Save changes</>}</button>
        </>}>
        <input type="hidden" name="id" value={record.id} />

        <div className="tablet-record-editor-layout">
          <section className="tablet-record-editor-details">
            <DelayHistoryBanner delayInfo={record.delay_info} />

            {job ? (
              <div className="tablet-record-editor-fields">
            <div className="workspace-form-section"><strong>Job details</strong><p>Keep the brief and client details up to date.</p></div>
            <label className="form-span">Job title<input name="title" required minLength={2} maxLength={200} defaultValue={job.title} /></label>
            {fixedClientId ? <input type="hidden" name="job_number" value={job.job_number ?? ""} /> : <label>Job number<input name="job_number" maxLength={60} defaultValue={job.job_number ?? ""} /></label>}
            {fixedClientId ? <input type="hidden" name="client_id" value={fixedClientId} /> : <label>Client<select name="client_id" defaultValue={job.client_id ?? ""}><option value="">No client yet</option>{clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
            <label>Status<select name="status_id" required defaultValue={job.status_id}>{jobStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            {!fixedClientId ? <label>Photos delivered<input name="photos_delivered" type="number" min="0" defaultValue={job.photos_delivered} /></label> : null}
            <div className="workspace-form-section"><strong>Schedule</strong><p>Production timing and the delivery deadline.</p></div>
            <label>Shoot date<input name="shoot_date" type="date" defaultValue={job.shoot_date ?? ""} /></label>
            <label>Shoot time<input name="shoot_time" type="time" defaultValue={job.shoot_time?.slice(0, 5) ?? ""} /></label>
            <label>Due date<input name="due_date" type="date" defaultValue={job.due_date ?? ""} /></label>
            <label>Due time<input name="due_time" type="time" defaultValue={job.due_time?.slice(0, 5) ?? ""} /></label>
            <div className="workspace-form-section"><strong>Production & delivery</strong><p>Location, client files and the brief.</p></div>
            <label className="form-span">Location<input name="location" maxLength={300} defaultValue={job.location ?? ""} /></label>
            <label className="form-span">Client delivery link<input name="delivery_url" type="url" inputMode="url" maxLength={2048} autoCapitalize="none" autoCorrect="off" placeholder="https://drive.google.com/…" defaultValue={job.delivery_url ?? ""} /></label>
            <label className="form-span">Description<textarea name="description" rows={3} maxLength={2000} defaultValue={job.description ?? ""} /></label>
            <label className="form-span">Key deliverables<textarea name="key_deliverables" rows={4} maxLength={10000} placeholder="One deliverable per line" defaultValue={job.key_deliverables?.join("\n") ?? ""} /><small>Up to 30 clear deliverables, one per line.</small></label>
            <input type="hidden" name="notes" value={job.notes ?? ""} />
              </div>
            ) : task ? (
              <div className="tablet-record-editor-fields">
            <div className="workspace-form-section"><strong>Asset details</strong><p>Name the deliverable and link it to a job.</p></div>
            <label className="form-span">Title<input name="title" required minLength={2} maxLength={220} defaultValue={task.title} /></label>
            <JobSearchField jobs={jobOptions} defaultJobId={task.job_id} />
            <label>Status<select name="status_id" required defaultValue={task.status_id}>{taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            <label>Asset type<select name="asset_type" defaultValue={task.asset_type === "Other" ? "Other" : "Asset"} required><option value="Asset">Asset</option><option value="Other">Other</option></select></label>
            <div className="workspace-form-section"><strong>Production</strong><p>Effort, timing and priority.</p></div>
            <label>Hours<input name="hours" type="number" min="0" step="0.25" inputMode="decimal" defaultValue={task.hours ?? ""} /></label>
            <label>Due time<input name="due_time" type="time" defaultValue={task.due_time?.slice(0, 5) ?? ""} /></label>
            <label>Priority<select name="priority" defaultValue={task.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="form-span">Description<textarea name="description" rows={3} maxLength={2000} defaultValue={task.description ?? ""} /></label>
              </div>
            ) : null}
          </section>
          <RecordNotesPanel legacyNote={job?.notes} notes={record.record_notes} recordId={record.id} recordKind={isJob ? "job" : "task"} />
        </div>

        {errorMessage ? <p className="calendar-editor-error" role="alert">{errorMessage}</p> : null}
      </WorkspaceDialog>
  );
}

export function TabletScheduleEditor({ item, onClose, onSaved }: { item: CalendarItem; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
      <WorkspaceDialog className="tablet-record-editor is-schedule-editor" onSubmit={save} busy={saving} titleId="tablet-schedule-editor-title" onClose={onClose} header={<>
          <div><span><CalendarPlus2 size={13} /> {item.entity_type === "job" ? "Job schedule" : item.entity_type === "campaign-asset" ? "Campaign asset schedule" : "Task deadline"}</span><h2 id="tablet-schedule-editor-title">{item.title}</h2><p>{item.status_label}{item.entity_type === "campaign-asset" ? ` · ${item.campaign_title}` : ""}{item.client_name ? ` · ${item.client_name}` : ""}</p></div>
          <button type="button" onClick={onClose} aria-label="Close schedule editor" disabled={saving}><X size={17} /></button>
        </>} footer={<><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={14} /> Saving…</> : "Save schedule"}</button></>}>
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
      </WorkspaceDialog>
  );
}
