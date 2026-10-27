"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, Clock3, Copy, GripVertical, Pencil } from "lucide-react";
import { movePipelineTask } from "@/app/admin/actions";
import { approveProductionTask } from "@/app/autopacific/brief-actions";
import { formatDate } from "@/lib/format";
import { visiblePipelineStatuses } from "@/lib/status-workflow";
import { nextTaskPosition } from "@/lib/task-position";
import type { PipelineTask, TaskStatus } from "@/lib/types";

type PipelineVariant = "admin" | "tablet";
const EMPTY_STATUS_ALIASES: Record<string, string> = {};

function TaskCard({ task, editable, workflowEnabled, approvalOnly, isSaving, canComplete, onComplete, onDuplicate, onEdit, onView, variant }: { task: PipelineTask; editable: boolean; workflowEnabled: boolean; approvalOnly: boolean; isSaving: boolean; canComplete: boolean; onComplete: () => void; onDuplicate?: (task: PipelineTask) => void; onEdit?: (task: PipelineTask) => void; onView?: (task: PipelineTask) => void; variant: PipelineVariant }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: isSaving || !workflowEnabled });
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? .45 : 1 }} className={`pipeline-task pipeline-task-${variant} ${isSaving ? "is-saving" : ""} ${editable ? "is-editable" : "is-read-only"}`} aria-busy={isSaving}>
      {workflowEnabled || (approvalOnly && canComplete) || (editable && (onEdit || onDuplicate)) ? <div className="pipeline-task-controls">
        {workflowEnabled ? <button type="button" className="drag-handle" {...listeners} {...attributes} aria-label={`Move ${task.title}`} disabled={isSaving}><GripVertical size={15} /></button> : null}
        {editable && onEdit ? <button type="button" className="tablet-card-edit-button" aria-label={`Edit ${task.title}`} title="Edit asset" onClick={() => onEdit(task)} disabled={isSaving}><Pencil size={13} /></button> : null}
        {editable && onDuplicate ? <button type="button" className="tablet-card-duplicate-button" aria-label={`Duplicate ${task.title}`} title="Duplicate asset" onClick={() => onDuplicate(task)} disabled={isSaving}><Copy size={13} /></button> : null}
        {(workflowEnabled || approvalOnly) && canComplete ? <button type="button" className="pipeline-complete-button" aria-label={approvalOnly ? `Approve and complete ${task.title}` : `Mark ${task.title} as posted and done`} title={approvalOnly ? "Approve & complete" : "Mark Posted / Done"} onClick={onComplete} disabled={isSaving}><Check size={14} /></button> : null}
      </div> : null}
      {onView ? (
        <button type="button" className="tablet-task-card-primary" aria-label={`View details for ${task.title}`} onClick={() => onView(task)}>
          <span className="task-client">{task.job?.client?.name ?? "No client"}</span>
          <strong>{task.title}</strong>
          <small>{task.job?.title ?? "Unlinked job"}</small>
          {variant === "tablet" ? <em className={`tablet-task-priority priority-${task.priority}`}>{task.priority}</em> : null}
          <span className="task-meta">
            <span><Clock3 size={13} /> {task.hours == null ? "Hours unset" : `${task.hours}h`}</span>
            <span><CalendarDays size={13} /> {formatDate(task.due_date)}</span>
          </span>
        </button>
      ) : (
        <>
          <div className="task-client">{task.job?.client?.name ?? "No client"}</div>
          <h3>{task.title}</h3>
          <p>{task.job?.title ?? "Unlinked job"}</p>
          {variant === "tablet" ? <span className={`tablet-task-priority priority-${task.priority}`}>{task.priority}</span> : null}
          <div className="task-meta">
            <span><Clock3 size={13} /> {task.hours == null ? "Hours unset" : `${task.hours}h`}</span>
            <span><CalendarDays size={13} /> {formatDate(task.due_date)}</span>
          </div>
        </>
      )}
    </article>
  );
}

function Column({ status, tasks, editable, workflowEnabled, approvalOnly, savingId, onComplete, onDuplicateTask, onEditTask, onViewTask, variant, completionStatusKey }: { status: TaskStatus; tasks: PipelineTask[]; editable: boolean; workflowEnabled: boolean; approvalOnly: boolean; savingId: string | null; onComplete: (task: PipelineTask) => void; onDuplicateTask?: (task: PipelineTask) => void; onEditTask?: (task: PipelineTask) => void; onViewTask?: (task: PipelineTask) => void; variant: PipelineVariant; completionStatusKey: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-${status.id}`, disabled: !workflowEnabled });
  return (
    <section ref={setNodeRef} className={`pipeline-column pipeline-column-${variant} ${isOver ? "is-over" : ""}`} style={{ "--pipeline-status-color": status.color } as CSSProperties}>
      <header><span style={{ background: status.color }} /><h2>{status.label}</h2><b>{tasks.length}</b></header>
      <div className="pipeline-stack">
        {tasks.map((task) => <TaskCard key={task.id} task={task} editable={editable} workflowEnabled={workflowEnabled} approvalOnly={approvalOnly} isSaving={savingId === task.id} canComplete={status.key === completionStatusKey} onComplete={() => onComplete(task)} onDuplicate={onDuplicateTask} onEdit={onEditTask} onView={onViewTask} variant={variant} />)}
        {!tasks.length && <div className="pipeline-empty">{workflowEnabled ? "Drop an asset here" : "No assets"}</div>}
      </div>
    </section>
  );
}

export function PipelineBoard({
  editable = true,
  approvalOnly = false,
  isOffline = false,
  initialStatuses,
  initialTasks,
  completionStatusKey = "ready_to_post",
  onDuplicateTask,
  onEditTask,
  onViewTask,
  onMoveSaved,
  onTasksChange,
  onQueueMove,
  statusAliases = EMPTY_STATUS_ALIASES,
  variant = "admin",
  visibleStatusKeys,
  workflowEnabled,
}: {
  editable?: boolean;
  approvalOnly?: boolean;
  isOffline?: boolean;
  initialStatuses: TaskStatus[];
  initialTasks: PipelineTask[];
  completionStatusKey?: string;
  onDuplicateTask?: (task: PipelineTask) => void;
  onEditTask?: (task: PipelineTask) => void;
  onViewTask?: (task: PipelineTask) => void;
  onMoveSaved?: () => void;
  onTasksChange?: (tasks: PipelineTask[]) => void;
  onQueueMove?: (mutation: { expectedUpdatedAt: string; recordId: string; statusId: string; title: string }) => void;
  statusAliases?: Record<string, string>;
  variant?: PipelineVariant;
  visibleStatusKeys?: string[];
  workflowEnabled?: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor),
  );
  const canUpdateWorkflow = workflowEnabled ?? editable;
  const visibleStatuses = useMemo(() => {
    if (!visibleStatusKeys) return visiblePipelineStatuses(initialStatuses);
    const statusesByKey = new Map(initialStatuses.map((status) => [status.key, status]));
    return visibleStatusKeys.flatMap((key) => {
      const status = statusesByKey.get(key);
      return status ? [status] : [];
    });
  }, [initialStatuses, visibleStatusKeys]);
  const postedStatus = useMemo(() => initialStatuses.find((status) => status.key === "posted_done") ?? null, [initialStatuses]);
  const displayStatusByTaskStatus = useMemo(() => {
    const statusesByKey = new Map(initialStatuses.map((status) => [status.key, status]));
    const aliases = new Map<string, string>();
    for (const [sourceKey, destinationKey] of Object.entries(statusAliases)) {
      const source = statusesByKey.get(sourceKey);
      const destination = statusesByKey.get(destinationKey);
      if (source && destination) aliases.set(source.id, destination.id);
    }
    return aliases;
  }, [initialStatuses, statusAliases]);
  const byStatus = useMemo(() => new Map(visibleStatuses.map((status) => [status.id, tasks.filter((task) => (displayStatusByTaskStatus.get(task.status_id) ?? task.status_id) === status.id)])), [displayStatusByTaskStatus, tasks, visibleStatuses]);

  async function saveMove(taskId: string, destination: string, successMessage: string, approval = false) {
    if ((!canUpdateWorkflow && !(approvalOnly && approval)) || savingId) return;
    const current = tasks.find((task) => task.id === taskId);
    if (!current || current.status_id === destination) return;

    setMessage("");
    setSavingId(taskId);
    try {
      const highestDestinationPosition = tasks
        .filter((task) => task.status_id === destination)
        .reduce((highest, task) => Math.max(highest, Number(task.position)), 0);
      const position = nextTaskPosition(highestDestinationPosition);
      const nextTasks = tasks
        .map((task) => task.id === taskId ? { ...task, status_id: destination, position } : task)
        .sort((left, right) => Number(left.position) - Number(right.position));
      setTasks(nextTasks);
      onTasksChange?.(nextTasks);
      if (isOffline && approvalOnly) throw new Error("Reconnect before approving work.");
      if (isOffline) {
        onQueueMove?.({ expectedUpdatedAt: current.updated_at, recordId: current.id, statusId: destination, title: current.title });
        setMessage(`${current.title} will sync when reception returns.`);
        return;
      }
      if (approvalOnly && approval) await approveProductionTask(taskId);
      else await movePipelineTask(taskId, destination);
      setMessage(successMessage);
      onMoveSaved?.();
    } catch (error) {
      const restoredTasks = tasks
        .map((task) => task.id === taskId ? current : task)
        .sort((left, right) => Number(left.position) - Number(right.position));
      setTasks(restoredTasks);
      onTasksChange?.(restoredTasks);
      setMessage(approvalOnly && error instanceof Error ? error.message : "The move was not saved. Your card has been restored—please try again.");
    } finally {
      setSavingId(null);
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!canUpdateWorkflow) return;
    const taskId = String(event.active.id);
    if (!event.over) return;
    const overId = String(event.over.id);
    const destination = overId.startsWith("status-")
      ? overId.replace("status-", "")
      : (() => {
          const targetStatusId = tasks.find((task) => task.id === overId)?.status_id;
          return targetStatusId ? displayStatusByTaskStatus.get(targetStatusId) ?? targetStatusId : undefined;
        })();
    const current = tasks.find((task) => task.id === taskId);
    if (!destination || !current || (displayStatusByTaskStatus.get(current.status_id) ?? current.status_id) === destination) return;
    await saveMove(taskId, destination, `${current.title} moved successfully.`);
  }

  function completeTask(task: PipelineTask) {
    if (!canUpdateWorkflow && !approvalOnly) return;
    if (!postedStatus) {
      setMessage("The Posted / Done status is unavailable.");
      return;
    }
    void saveMove(task.id, postedStatus.id, `${task.title} ${approvalOnly ? "approved and completed" : "marked Posted / Done"}.`, approvalOnly);
  }

  return (
    <>
      {variant === "admin" ? <div className="pipeline-toolbar pipeline-toolbar-admin"><p>Drag assets between active stages. Use the checkmark in Ready To Post to complete an asset.</p>{message ? <span role="status">{message}</span> : null}</div> : message ? <span className="pipeline-status-toast" role="status">{message}</span> : null}
      <DndContext sensors={canUpdateWorkflow ? sensors : []} onDragEnd={onDragEnd}>
        <div className={`pipeline-board pipeline-board-${variant}`}>
          {visibleStatuses.map((status) => <Column key={status.id} status={status} tasks={byStatus.get(status.id) ?? []} editable={editable} workflowEnabled={canUpdateWorkflow} approvalOnly={approvalOnly} savingId={savingId} onComplete={completeTask} onDuplicateTask={onDuplicateTask} onEditTask={onEditTask} onViewTask={onViewTask} variant={variant} completionStatusKey={completionStatusKey} />)}
        </div>
      </DndContext>
    </>
  );
}
