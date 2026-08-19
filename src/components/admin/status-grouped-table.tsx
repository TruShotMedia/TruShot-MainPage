"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil } from "lucide-react";
import { bulkUpdateJobStatus, bulkUpdateTaskStatus, updateJob, updateTask } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { SubmitButton } from "@/components/admin/submit-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { changeWorkflowStatus, getGroupSelectionState, sortWorkflowStatuses } from "@/lib/status-workflow";
import type { JobRecord, JobStatus, PipelineTask, SelectOption, TaskStatus } from "@/lib/types";

type WorkflowStatus = JobStatus | TaskStatus;
type WorkflowRecord = JobRecord | PipelineTask;

type StatusGroupedTableProps =
  | { kind: "jobs"; statuses: JobStatus[]; records: JobRecord[]; clients: SelectOption[] }
  | { kind: "tasks"; statuses: TaskStatus[]; records: PipelineTask[]; jobs: SelectOption[] };

function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={onChange} />;
}

function DraggableRow({
  id,
  title,
  selected,
  saving,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  selected: boolean;
  saving: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: saving });
  return (
    <tr
      ref={setNodeRef}
      className={`${selected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""} ${saving ? "is-saving" : ""}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      aria-busy={saving}
    >
      <td className="selection-cell"><SelectionCheckbox checked={selected} label={`Select ${title}`} onChange={onToggle} /></td>
      <td className="drag-cell"><button type="button" className="status-row-drag" aria-label={`Move ${title}`} {...listeners} {...attributes} disabled={saving}><GripVertical size={15} /></button></td>
      {children}
    </tr>
  );
}

function JobCells({ job, clients, statuses }: { job: JobRecord; clients: SelectOption[]; statuses: JobStatus[] }) {
  return (
    <>
      <td><strong>{job.title}</strong><small>{job.client?.name ?? "No client"}</small></td>
      <td><small>Shoot {formatDate(job.shoot_date)}</small><small>Due {formatDate(job.due_date)}</small></td>
      <td><strong>{Number(job.hours ?? 0).toFixed(2)}</strong>{job.has_unset_task_hours ? <small className="warning-text">Unset task hours</small> : null}</td>
      <td>{String(job.created_assets ?? 0)}</td>
      <td>{String(job.photos_delivered ?? 0)}</td>
      <td><span className="count-pill">{String(job.open_tasks ?? 0)}</span></td>
      <td><strong>{formatCurrency(Number(job.value_cents ?? 0))}</strong>{job.allocation_needs_hours ? <small className="warning-text">Needs hours</small> : null}</td>
      <td>
        <ActionPopover
          action={updateJob}
          summary={<><Pencil size={14} /> Edit</>}
          title={`Edit ${job.title}`}
          detailsClassName="row-editor"
          summaryClassName=""
          formClassName="quick-form wide"
        >
          <input type="hidden" name="id" value={job.id} />
          <label>Job title<input name="title" required defaultValue={job.title} /></label>
          <label>Job number<input name="job_number" defaultValue={job.job_number ?? ""} /></label>
          <label>Client<select name="client_id" defaultValue={job.client_id ?? ""}><option value="">No client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label>Status<select name="status_id" required defaultValue={job.status_id}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label>Shoot date<input name="shoot_date" type="date" defaultValue={job.shoot_date ?? ""} /></label>
          <label>Due date<input name="due_date" type="date" defaultValue={job.due_date ?? ""} /></label>
          <label>Photos delivered<input name="photos_delivered" type="number" min="0" defaultValue={Number(job.photos_delivered ?? 0)} /></label>
          <label>Location<input name="location" defaultValue={job.location ?? ""} /></label>
          <label className="form-span">Description<textarea name="description" rows={3} defaultValue={job.description ?? ""} /></label>
          <label className="form-span">Internal notes<textarea name="notes" rows={3} defaultValue={job.notes ?? ""} /></label>
          <SubmitButton pendingLabel="Saving…">Save job</SubmitButton>
        </ActionPopover>
      </td>
    </>
  );
}

function TaskCells({ task, jobs, statuses }: { task: PipelineTask; jobs: SelectOption[]; statuses: TaskStatus[] }) {
  return (
    <>
      <td><strong>{task.title}</strong><small>{task.job?.client?.name ?? "No client"}</small></td>
      <td><strong>{task.job?.title ?? "Unlinked job"}</strong></td>
      <td>{task.hours == null ? <span className="warning-text">Unset</span> : `${Number(task.hours).toFixed(2)}h`}</td>
      <td>{formatDate(task.due_date)}</td>
      <td>{task.asset_type ?? "—"}</td>
      <td><span className={`task-priority priority-${task.priority}`}>{task.priority}</span></td>
      <td>
        <ActionPopover
          action={updateTask}
          summary={<><Pencil size={14} /> Edit</>}
          title={`Edit ${task.title}`}
          detailsClassName="row-editor"
          summaryClassName=""
          formClassName="quick-form wide"
        >
          <input type="hidden" name="id" value={task.id} />
          <label>Title<input name="title" required defaultValue={task.title} /></label>
          <label>Job<select name="job_id" required defaultValue={task.job_id}>{jobs.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}</select></label>
          <label>Status<select name="status_id" required defaultValue={task.status_id}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label>Asset type<input name="asset_type" defaultValue={task.asset_type ?? ""} /></label>
          <label>Hours<input name="hours" type="number" min="0" step="0.25" defaultValue={task.hours ?? ""} /></label>
          <label>Due date<input name="due_date" type="date" defaultValue={task.due_date ?? ""} /></label>
          <label>Priority<select name="priority" defaultValue={task.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          <label className="form-span">Description<textarea name="description" rows={3} defaultValue={task.description ?? ""} /></label>
          <SubmitButton pendingLabel="Saving…">Save asset</SubmitButton>
        </ActionPopover>
      </td>
    </>
  );
}

function TableHeading({ kind }: { kind: "jobs" | "tasks" }) {
  return kind === "jobs" ? (
    <tr><th><span className="sr-only">Select</span></th><th><span className="sr-only">Move</span></th><th>Job</th><th>Dates</th><th>Hours</th><th>Assets</th><th>Photos</th><th>Open</th><th>Value</th><th><span className="sr-only">Actions</span></th></tr>
  ) : (
    <tr><th><span className="sr-only">Select</span></th><th><span className="sr-only">Move</span></th><th>Asset</th><th>Job</th><th>Hours</th><th>Due</th><th>Type</th><th>Priority</th><th><span className="sr-only">Actions</span></th></tr>
  );
}

function StatusGroup({
  kind,
  status,
  records,
  selectedIds,
  savingIds,
  onToggle,
  onToggleGroup,
  clients,
  jobs,
  statuses,
}: {
  kind: "jobs" | "tasks";
  status: WorkflowStatus;
  records: WorkflowRecord[];
  selectedIds: ReadonlySet<string>;
  savingIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (ids: string[], allSelected: boolean) => void;
  clients: SelectOption[];
  jobs: SelectOption[];
  statuses: WorkflowStatus[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-group-${status.id}` });
  const recordIds = records.map((record) => record.id);
  const selection = getGroupSelectionState(recordIds, selectedIds);
  const headingId = `${kind}-status-${status.id}`;
  return (
    <section ref={setNodeRef} className={`status-table-group ${isOver ? "is-over" : ""}`} aria-labelledby={headingId}>
      <header className="status-table-group-header">
        <SelectionCheckbox
          checked={selection.allSelected}
          indeterminate={selection.partiallySelected}
          label={`Select all ${status.label} ${kind}`}
          onChange={() => onToggleGroup(recordIds, selection.allSelected)}
        />
        <span className="status-dot" style={{ background: status.color }} />
        <div><h2 id={headingId}>{status.label}</h2><p>{records.length} {records.length === 1 ? kind.slice(0, -1) : kind}{selection.selectedCount ? ` · ${selection.selectedCount} selected` : ""}</p></div>
        <b>{String(status.position).padStart(2, "0")}</b>
      </header>
      {records.length ? (
        <div className="admin-table-wrap">
          <table className={`admin-table status-record-table ${kind === "jobs" ? "jobs-table" : "tasks-table"}`}>
            <thead><TableHeading kind={kind} /></thead>
            <tbody>
              {records.map((record) => (
                <DraggableRow
                  key={record.id}
                  id={record.id}
                  title={record.title}
                  selected={selectedIds.has(record.id)}
                  saving={savingIds.has(record.id)}
                  onToggle={() => onToggle(record.id)}
                >
                  {kind === "jobs"
                    ? <JobCells job={record as JobRecord} clients={clients} statuses={statuses as JobStatus[]} />
                    : <TaskCells task={record as PipelineTask} jobs={jobs} statuses={statuses as TaskStatus[]} />}
                </DraggableRow>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="status-group-empty">Drop {kind === "jobs" ? "a job" : "an asset"} here.</p>}
    </section>
  );
}

function sortRecords(kind: "jobs" | "tasks", records: WorkflowRecord[]) {
  return [...records].sort((left, right) => {
    if (kind === "tasks") {
      const positionDifference = Number((left as PipelineTask).position) - Number((right as PipelineTask).position);
      if (positionDifference) return positionDifference;
    }
    const leftDate = kind === "jobs" ? (left as JobRecord).due_date : (left as PipelineTask).due_date;
    const rightDate = kind === "jobs" ? (right as JobRecord).due_date : (right as PipelineTask).due_date;
    return (leftDate ?? "9999-12-31").localeCompare(rightDate ?? "9999-12-31") || left.title.localeCompare(right.title);
  });
}

export function StatusGroupedTable(props: StatusGroupedTableProps) {
  const { kind } = props;
  const orderedStatuses = useMemo(() => sortWorkflowStatuses(props.statuses as WorkflowStatus[]), [props.statuses]);
  const [records, setRecords] = useState<WorkflowRecord[]>(props.records);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [targetStatusId, setTargetStatusId] = useState("");
  const [message, setMessage] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor),
  );

  const recordsByStatus = useMemo(() => {
    const groups = new Map(orderedStatuses.map((status) => [status.id, [] as WorkflowRecord[]]));
    for (const record of records) groups.get(record.status_id)?.push(record);
    for (const [statusId, statusRecords] of groups) groups.set(statusId, sortRecords(kind, statusRecords));
    return groups;
  }, [kind, orderedStatuses, records]);

  function toggleRecord(recordId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }

  function toggleGroup(recordIds: string[], allSelected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of recordIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function saveStatusChange(recordIds: string[], statusId: string) {
    const destination = orderedStatuses.find((status) => status.id === statusId);
    if (!destination || !recordIds.length || savingIds.size) return;
    const movedIds = new Set(recordIds);
    const previousRecords = records;
    const previousSelection = selectedIds;
    const movedTitles = records.filter((record) => movedIds.has(record.id)).map((record) => record.title);
    setMessage("");
    setSavingIds(new Set(recordIds));
    setRecords((current) => changeWorkflowStatus(current, recordIds, statusId));
    setSelectedIds((current) => new Set([...current].filter((id) => !movedIds.has(id))));
    try {
      if (kind === "jobs") await bulkUpdateJobStatus(recordIds, statusId);
      else await bulkUpdateTaskStatus(recordIds, statusId);
      setMessage(recordIds.length === 1
        ? `${movedTitles[0] ?? "Record"} moved to ${destination.label}.`
        : `${recordIds.length} ${kind} moved to ${destination.label}.`);
    } catch {
      setRecords(previousRecords);
      setSelectedIds(previousSelection);
      setMessage(`The ${recordIds.length === 1 ? "status change was" : "bulk changes were"} not saved. Your rows have been restored.`);
    } finally {
      setSavingIds(new Set());
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const recordId = String(event.active.id);
    const overId = String(event.over.id);
    if (!overId.startsWith("status-group-")) return;
    const statusId = overId.replace("status-group-", "");
    const current = records.find((record) => record.id === recordId);
    if (!current || current.status_id === statusId) return;
    await saveStatusChange([recordId], statusId);
  }

  function submitBulkChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetStatusId) {
      setMessage("Choose the destination status first.");
      return;
    }
    void saveStatusChange([...selectedIds], targetStatusId);
  }

  const clients = props.kind === "jobs" ? props.clients : [];
  const jobs = props.kind === "tasks" ? props.jobs : [];
  return (
    <>
      <div className={`status-bulk-toolbar ${selectedIds.size ? "is-active" : ""}`}>
        {selectedIds.size ? (
          <form onSubmit={submitBulkChange}>
            <strong>{selectedIds.size} selected</strong>
            <label><span className="sr-only">New status</span><select value={targetStatusId} onChange={(event) => setTargetStatusId(event.target.value)} aria-label={`New status for selected ${kind}`}><option value="">Choose status…</option>{orderedStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
            <button type="submit" className="admin-primary-button" disabled={Boolean(savingIds.size)}>Change status</button>
            <button type="button" className="status-selection-clear" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </form>
        ) : <p>Select individual rows or a status heading, then update them together. Drag any row into another group for a single status change.</p>}
        {message ? <span role="status">{message}</span> : null}
      </div>
      <DndContext sensors={sensors} onDragEnd={(event) => { void onDragEnd(event); }}>
        <div className="status-table-groups">
          {orderedStatuses.map((status) => (
            <StatusGroup
              key={status.id}
              kind={kind}
              status={status}
              records={recordsByStatus.get(status.id) ?? []}
              selectedIds={selectedIds}
              savingIds={savingIds}
              onToggle={toggleRecord}
              onToggleGroup={toggleGroup}
              clients={clients}
              jobs={jobs}
              statuses={orderedStatuses}
            />
          ))}
        </div>
      </DndContext>
    </>
  );
}
