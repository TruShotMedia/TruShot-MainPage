"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarDays, Check, ChevronDown, Copy, Flag, GripVertical, ListChecks, Pencil, RotateCcw, ArrowRight } from "lucide-react";
import { pipelineColumnCollision, pipelineColumnKeyboardCoordinates } from "@/lib/pipeline-drag";
import { PipelineDragPreview } from "@/components/shared/pipeline-drag-preview";
import { bulkUpdateJobStatus } from "@/app/admin/actions";
import { formatDate } from "@/lib/format";
import type { JobStatus, TabletJobRecord } from "@/lib/types";
import { TeamAvatars, useProductionTeam } from "@/components/autopacific/team-context";
import { jobProgress } from "@/lib/production-team";

function sortJobs(jobs: TabletJobRecord[]) {
  return [...jobs].sort((left, right) => {
    if (left.shoot_date !== right.shoot_date) {
      if (!left.shoot_date) return 1;
      if (!right.shoot_date) return -1;
      return right.shoot_date.localeCompare(left.shoot_date);
    }
    return left.title.localeCompare(right.title);
  });
}

function jobScheduleSummary(job: TabletJobRecord) {
  return `Shoot ${formatDate(job.shoot_date)} · Due ${formatDate(job.due_date)}`;
}

function JobSchedulePills({ job }: { job: TabletJobRecord }) {
  if (job.status?.key === "planning" && !job.shoot_date && !job.due_date) return <div className="tablet-job-card-schedule"><span><CalendarDays size={11} aria-hidden="true" /> Dates to be confirmed</span></div>;
  return (
    <div className="tablet-job-card-schedule" aria-label={jobScheduleSummary(job)}>
      <span className="is-shoot"><CalendarDays size={11} aria-hidden="true" /><b>Shoot</b>{formatDate(job.shoot_date)}</span>
      <span className="is-due"><Flag size={11} aria-hidden="true" /><b>Due</b>{formatDate(job.due_date)}</span>
    </div>
  );
}

function DelayedJobMarker({ job }: { job: TabletJobRecord }) {
  if (!job.delay_info?.delayed_from) return null;
  return <span className="tablet-delay-indicator" title={`Rescheduled because: ${job.delay_info.delayed_from.reason}`}><RotateCcw size={11} /> Rescheduled</span>;
}

function JobCard({ canComplete, canSchedule, editable, job, isSaving, dragDisabled, onComplete, onSchedule, onDuplicate, onEdit, onView }: { canComplete: boolean; canSchedule: boolean; editable: boolean; job: TabletJobRecord; isSaving: boolean; dragDisabled: boolean; onComplete: () => void; onSchedule: () => void; onDuplicate: (job: TabletJobRecord) => void; onEdit: (job: TabletJobRecord) => void; onView: (job: TabletJobRecord) => void }) {
  const team = useProductionTeam();
  const progress = jobProgress(job);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: job.id, disabled: dragDisabled });
  return (
    <article
      ref={setNodeRef}
      className={`tablet-job-card pipeline-task pipeline-task-tablet ${editable ? "is-editable" : "is-read-only"} ${isSaving ? "is-saving" : ""} ${isDragging ? "is-dragging" : ""}`}
      aria-busy={isSaving}
      style={{ "--pipeline-control-count": (editable ? 3 : 1) + (canComplete ? 1 : 0) } as CSSProperties}
    >
      <div className="pipeline-task-controls">
        <button ref={setActivatorNodeRef} type="button" className="drag-handle" {...listeners} {...attributes} aria-label={`Move ${job.title}`} disabled={dragDisabled}><GripVertical size={15} /></button>
        {editable ? <button type="button" className="tablet-card-edit-button" aria-label={`Edit ${job.title}`} title="Edit job" onClick={() => onEdit(job)} disabled={isSaving}><Pencil size={13} /></button> : null}
        {editable ? <button type="button" className="tablet-card-duplicate-button" aria-label={`Duplicate ${job.title}`} title="Duplicate job" onClick={() => onDuplicate(job)} disabled={isSaving}><Copy size={13} /></button> : null}
        {canComplete ? <button type="button" className="pipeline-complete-button" aria-label={`Mark ${job.title} as delivered`} title="Mark Delivered" onClick={onComplete} disabled={isSaving}><Check size={14} /></button> : null}
      </div>
      <div className="pipeline-card-content">
      <button type="button" className="tablet-job-card-primary" aria-label={`View details for ${job.title}`} onClick={() => onView(job)}>
          <span className="task-client">{job.client?.name ?? "No client"}</span>
          <DelayedJobMarker job={job} />
          <strong>{job.title}</strong>
          <JobSchedulePills job={job} />
      </button>
      {team ? <div className="team-job-meta"><span className={`team-priority is-${job.priority ?? "normal"}`}><i />{job.priority ?? "normal"} priority</span><TeamAvatars ids={job.assignee_ids} /></div> : null}
      {team ? <div className="team-job-progress"><span>{progress.total ? `${progress.completed} of ${progress.total} tasks complete` : "No tasks yet"}<b>{progress.percent}%</b></span><progress max="100" value={progress.percent} aria-label={`Task progress for ${job.title}`} /></div> : null}
      <details className="tablet-job-card-operational">
        <summary><span>Operational detail</span><ChevronDown size={14} /></summary>
        <div>
          <div className="task-meta tablet-job-card-dates">
            <span><CalendarDays size={13} /> Shoot {formatDate(job.shoot_date)}</span>
            <span>Due {formatDate(job.due_date)}</span>
          </div>
          <div className="tablet-job-card-progress"><ListChecks size={13} /><strong>{job.open_tasks}</strong><span>open · {job.total_tasks} total</span></div>
        </div>
      </details>
      {canSchedule ? <button type="button" className="tablet-job-schedule-button" onClick={onSchedule} disabled={dragDisabled}>Move to Scheduled <ArrowRight size={14} /></button> : null}
      </div>
    </article>
  );
}

function JobColumn({ canComplete, canSchedule, editable, status, jobs, savingId, onComplete, onSchedule, onDuplicate, onEdit, onView }: { canComplete: boolean; canSchedule: boolean; editable: boolean; status: JobStatus; jobs: TabletJobRecord[]; savingId: string | null; onComplete: (job: TabletJobRecord) => void; onSchedule: (job: TabletJobRecord) => void; onDuplicate: (job: TabletJobRecord) => void; onEdit: (job: TabletJobRecord) => void; onView: (job: TabletJobRecord) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `job-status-${status.id}` });
  return (
    <section ref={setNodeRef} className={`pipeline-column pipeline-column-tablet tablet-job-column ${isOver ? "is-over" : ""}`} style={{ "--pipeline-status-color": status.color } as CSSProperties}>
      <header><span style={{ background: status.color }} /><h2>{status.label}</h2><b>{jobs.length}</b>{isOver ? <em className="pipeline-drop-hint">Drop here</em> : null}</header>
      <div className="pipeline-stack">
        {jobs.map((job) => <JobCard key={job.id} canComplete={canComplete} canSchedule={canSchedule} editable={editable} job={job} isSaving={savingId === job.id} dragDisabled={Boolean(savingId)} onComplete={() => onComplete(job)} onSchedule={() => onSchedule(job)} onDuplicate={onDuplicate} onEdit={onEdit} onView={onView} />)}
        {!jobs.length ? <div className="pipeline-empty">Drop a job here</div> : null}
      </div>
    </section>
  );
}

export function TabletJobPipeline({ editable = true, initialJobs, statuses, visibleStatusKeys, enableCompletion = true, isOffline = false, onDuplicateJob, onEditJob, onJobsChange, onMoveSaved, onQueueMove, onViewJob }: {
  editable?: boolean;
  initialJobs: TabletJobRecord[];
  statuses: JobStatus[];
  visibleStatusKeys?: string[];
  enableCompletion?: boolean;
  isOffline?: boolean;
  onDuplicateJob: (job: TabletJobRecord) => void;
  onEditJob: (job: TabletJobRecord) => void;
  onJobsChange?: (jobs: TabletJobRecord[]) => void;
  onMoveSaved?: () => void;
  onQueueMove?: (mutation: { expectedUpdatedAt: string; recordId: string; statusId: string; title: string }) => void;
  onViewJob: (job: TabletJobRecord) => void;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: pipelineColumnKeyboardCoordinates }),
  );
  const orderedStatuses = useMemo(
    // Delayed records are immutable history; their linked successor is the
    // actionable card. Keep the active board focused on work that can move.
    () => statuses.filter((status) => status.key !== "delivered" && status.key !== "delayed" && (!visibleStatusKeys || visibleStatusKeys.includes(status.key))).sort((left, right) => left.position - right.position),
    [statuses, visibleStatusKeys],
  );
  const deliveredStatus = useMemo(() => statuses.find((status) => status.key === "delivered") ?? null, [statuses]);
  const scheduledStatus = statuses.find((status) => status.key === "scheduled");
  const finalVisibleStatusId = enableCompletion ? orderedStatuses.at(-1)?.id ?? null : null;
  const jobsByStatus = useMemo(() => {
    const grouped = new Map(orderedStatuses.map((status) => [status.id, [] as TabletJobRecord[]]));
    for (const job of jobs) grouped.get(job.status_id)?.push(job);
    for (const [statusId, records] of grouped) grouped.set(statusId, sortJobs(records));
    return grouped;
  }, [jobs, orderedStatuses]);

  async function moveJob(jobId: string, statusId: string) {
    if (savingId) return;
    const current = jobs.find((job) => job.id === jobId);
    const destination = statuses.find((status) => status.id === statusId);
    if (!current || !destination || current.status_id === statusId) return;
    const previousJobs = jobs;
    const movedAt = new Date().toISOString();
    const nextJobs = jobs.map((job) => job.id === jobId ? {
      ...job,
      status_id: statusId,
      status: destination,
      delivered_at: destination.is_closed ? job.delivered_at ?? movedAt : null,
    } : job);
    setMessage("");
    setSavingId(jobId);
    setJobs(nextJobs);
    onJobsChange?.(nextJobs);
    try {
      if (isOffline) {
        onQueueMove?.({ expectedUpdatedAt: current.updated_at, recordId: current.id, statusId, title: current.title });
        setMessage(`${current.title} will sync when reception returns.`);
        return;
      }
      await bulkUpdateJobStatus([jobId], statusId);
      setMessage(`${current.title} moved to ${destination.label}.`);
      onMoveSaved?.();
    } catch {
      setJobs(previousJobs);
      onJobsChange?.(previousJobs);
      setMessage("The job move was not saved. Its card has been restored—please try again.");
    } finally {
      setSavingId(null);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over) return;
    const overId = String(event.over.id);
    if (!overId.startsWith("job-status-")) return;
    void moveJob(String(event.active.id), overId.replace("job-status-", ""));
  }

  function scheduleJob(job: TabletJobRecord) {
    if (!scheduledStatus || !editable) return;
    if (!job.shoot_date) {
      setMessage("Choose a shoot date and save to schedule this job.");
      onEditJob({ ...job, status_id: scheduledStatus.id, status: scheduledStatus });
      return;
    }
    void moveJob(job.id, scheduledStatus.id);
  }

  function completeJob(job: TabletJobRecord) {
    if (!deliveredStatus) {
      setMessage("The Delivered status is unavailable.");
      return;
    }
    void moveJob(job.id, deliveredStatus.id);
  }

  return (
    <>
      {message ? <span className="pipeline-status-toast" role="status">{message}</span> : null}
      <DndContext sensors={sensors} collisionDetection={pipelineColumnCollision} onDragStart={({active}) => setActiveId(String(active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
        <div className="pipeline-board pipeline-board-tablet tablet-job-board" style={{ gridTemplateColumns: `repeat(${Math.max(1, orderedStatuses.length)}, minmax(0, 1fr))` }}>
          {orderedStatuses.map((status) => <JobColumn key={status.id} canComplete={status.id === finalVisibleStatusId} canSchedule={editable && status.key === "planning" && Boolean(scheduledStatus)} editable={editable} status={status} jobs={jobsByStatus.get(status.id) ?? []} savingId={savingId} onComplete={completeJob} onSchedule={scheduleJob} onDuplicate={onDuplicateJob} onEdit={onEditJob} onView={onViewJob} />)}
        </div>
        <PipelineDragPreview title={jobs.find(job => job.id === activeId)?.title} />
      </DndContext>
    </>
  );
}
