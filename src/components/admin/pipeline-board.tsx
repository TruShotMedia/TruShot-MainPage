"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, Clock3, GripVertical, Pencil } from "lucide-react";
import { movePipelineTask } from "@/app/admin/actions";
import { formatDate } from "@/lib/format";
import { visiblePipelineStatuses } from "@/lib/status-workflow";
import { nextTaskPosition } from "@/lib/task-position";
import type { PipelineTask, TaskStatus } from "@/lib/types";

type PipelineVariant = "admin" | "tablet";
const EMPTY_STATUS_ALIASES: Record<string, string> = {};

function TaskCard({ task, editable, isSaving, canComplete, onComplete, onEdit, variant }: { task: PipelineTask; editable: boolean; isSaving: boolean; canComplete: boolean; onComplete: () => void; onEdit?: (task: PipelineTask) => void; variant: PipelineVariant }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: isSaving || !editable });
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? .45 : 1 }} className={`pipeline-task pipeline-task-${variant} ${isSaving ? "is-saving" : ""} ${editable ? "is-editable" : "is-read-only"}`} aria-busy={isSaving}>
      {editable ? <div className="pipeline-task-controls">
        {canComplete ? <button type="button" className="pipeline-complete-button" aria-label={`Mark ${task.title} as posted and done`} title="Mark Posted / Done" onClick={onComplete} disabled={isSaving}><Check size={14} /></button> : null}
        {onEdit ? <button type="button" className="tablet-card-edit-button" aria-label={`Edit ${task.title}`} title="Edit asset" onClick={() => onEdit(task)} disabled={isSaving}><Pencil size={13} /></button> : null}
        <button type="button" className="drag-handle" {...listeners} {...attributes} aria-label={`Move ${task.title}`} disabled={isSaving}><GripVertical size={15} /></button>
      </div> : null}
      <div className="task-client">{task.job?.client?.name ?? "No client"}</div>
      <h3>{task.title}</h3>
      <p>{task.job?.title ?? "Unlinked job"}</p>
      {variant === "tablet" ? <span className={`tablet-task-priority priority-${task.priority}`}>{task.priority}</span> : null}
      <div className="task-meta">
        <span><Clock3 size={13} /> {task.hours == null ? "Hours unset" : `${task.hours}h`}</span>
        <span><CalendarDays size={13} /> {formatDate(task.due_date)}</span>
      </div>
    </article>
  );
}

function Column({ status, tasks, editable, savingId, onComplete, onEditTask, variant, completionStatusKey }: { status: TaskStatus; tasks: PipelineTask[]; editable: boolean; savingId: string | null; onComplete: (task: PipelineTask) => void; onEditTask?: (task: PipelineTask) => void; variant: PipelineVariant; completionStatusKey: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-${status.id}`, disabled: !editable });
  return (
    <section ref={setNodeRef} className={`pipeline-column pipeline-column-${variant} ${isOver ? "is-over" : ""}`} style={{ "--pipeline-status-color": status.color } as CSSProperties}>
      <header><span style={{ background: status.color }} /><h2>{status.label}</h2><b>{tasks.length}</b></header>
      <div className="pipeline-stack">
        {tasks.map((task) => <TaskCard key={task.id} task={task} editable={editable} isSaving={savingId === task.id} canComplete={status.key === completionStatusKey} onComplete={() => onComplete(task)} onEdit={onEditTask} variant={variant} />)}
        {!tasks.length && <div className="pipeline-empty">{editable ? "Drop an asset here" : "No assets"}</div>}
      </div>
    </section>
  );
}

export function PipelineBoard({
  editable = true,
  initialStatuses,
  initialTasks,
  completionStatusKey = "ready_to_post",
  onEditTask,
  onTasksChange,
  statusAliases = EMPTY_STATUS_ALIASES,
  variant = "admin",
  visibleStatusKeys,
}: {
  editable?: boolean;
  initialStatuses: TaskStatus[];
  initialTasks: PipelineTask[];
  completionStatusKey?: string;
  onEditTask?: (task: PipelineTask) => void;
  onTasksChange?: (tasks: PipelineTask[]) => void;
  statusAliases?: Record<string, string>;
  variant?: PipelineVariant;
  visibleStatusKeys?: string[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor),
  );
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

  async function saveMove(taskId: string, destination: string, successMessage: string) {
    if (!editable || savingId) return;
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
      await movePipelineTask(taskId, destination);
      setMessage(successMessage);
    } catch {
      const restoredTasks = tasks
        .map((task) => task.id === taskId ? current : task)
        .sort((left, right) => Number(left.position) - Number(right.position));
      setTasks(restoredTasks);
      onTasksChange?.(restoredTasks);
      setMessage("The move was not saved. Your card has been restored—please try again.");
    } finally {
      setSavingId(null);
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!editable) return;
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
    if (!editable) return;
    if (!postedStatus) {
      setMessage("The Posted / Done status is unavailable.");
      return;
    }
    void saveMove(task.id, postedStatus.id, `${task.title} marked Posted / Done.`);
  }

  return (
    <>
      {variant === "admin" ? <div className="pipeline-toolbar pipeline-toolbar-admin"><p>Drag assets between active stages. Use the checkmark in Ready To Post to complete an asset.</p>{message ? <span role="status">{message}</span> : null}</div> : message ? <span className="pipeline-status-toast" role="status">{message}</span> : null}
      <DndContext sensors={editable ? sensors : []} onDragEnd={onDragEnd}>
        <div className={`pipeline-board pipeline-board-${variant}`}>
          {visibleStatuses.map((status) => <Column key={status.id} status={status} tasks={byStatus.get(status.id) ?? []} editable={editable} savingId={savingId} onComplete={completeTask} onEditTask={onEditTask} variant={variant} completionStatusKey={completionStatusKey} />)}
        </div>
      </DndContext>
    </>
  );
}
