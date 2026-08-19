"use client";

import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, Clock3, GripVertical } from "lucide-react";
import { movePipelineTask } from "@/app/admin/actions";
import { formatDate } from "@/lib/format";
import { visiblePipelineStatuses } from "@/lib/status-workflow";
import { nextTaskPosition } from "@/lib/task-position";
import type { PipelineTask, TaskStatus } from "@/lib/types";

function TaskCard({ task, isSaving, canComplete, onComplete }: { task: PipelineTask; isSaving: boolean; canComplete: boolean; onComplete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: isSaving });
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? .45 : 1 }} className={`pipeline-task ${isSaving ? "is-saving" : ""}`} aria-busy={isSaving}>
      <div className="pipeline-task-controls">
        {canComplete ? <button type="button" className="pipeline-complete-button" aria-label={`Mark ${task.title} as posted and done`} title="Mark Posted / Done" onClick={onComplete} disabled={isSaving}><Check size={14} /></button> : null}
        <button type="button" className="drag-handle" {...listeners} {...attributes} aria-label={`Move ${task.title}`} disabled={isSaving}><GripVertical size={15} /></button>
      </div>
      <div className="task-client">{task.job?.client?.name ?? "No client"}</div>
      <h3>{task.title}</h3>
      <p>{task.job?.title ?? "Unlinked job"}</p>
      <div className="task-meta">
        <span><Clock3 size={13} /> {task.hours == null ? "Hours unset" : `${task.hours}h`}</span>
        <span><CalendarDays size={13} /> {formatDate(task.due_date)}</span>
      </div>
    </article>
  );
}

function Column({ status, tasks, savingId, onComplete }: { status: TaskStatus; tasks: PipelineTask[]; savingId: string | null; onComplete: (task: PipelineTask) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-${status.id}` });
  return (
    <section ref={setNodeRef} className={`pipeline-column ${isOver ? "is-over" : ""}`}>
      <header><span style={{ background: status.color }} /><h2>{status.label}</h2><b>{tasks.length}</b></header>
      <div className="pipeline-stack">
        {tasks.map((task) => <TaskCard key={task.id} task={task} isSaving={savingId === task.id} canComplete={status.key === "ready_to_post"} onComplete={() => onComplete(task)} />)}
        {!tasks.length && <div className="pipeline-empty">Drop an asset here</div>}
      </div>
    </section>
  );
}

export function PipelineBoard({ initialStatuses, initialTasks }: { initialStatuses: TaskStatus[]; initialTasks: PipelineTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor),
  );
  const visibleStatuses = useMemo(() => visiblePipelineStatuses(initialStatuses), [initialStatuses]);
  const postedStatus = useMemo(() => initialStatuses.find((status) => status.key === "posted_done") ?? null, [initialStatuses]);
  const byStatus = useMemo(() => new Map(visibleStatuses.map((status) => [status.id, tasks.filter((task) => task.status_id === status.id)])), [tasks, visibleStatuses]);

  async function saveMove(taskId: string, destination: string, successMessage: string) {
    if (savingId) return;
    const current = tasks.find((task) => task.id === taskId);
    if (!current || current.status_id === destination) return;

    setMessage("");
    setSavingId(taskId);
    try {
      const highestDestinationPosition = tasks
        .filter((task) => task.status_id === destination)
        .reduce((highest, task) => Math.max(highest, Number(task.position)), 0);
      const position = nextTaskPosition(highestDestinationPosition);
      setTasks((all) => all
        .map((task) => task.id === taskId ? { ...task, status_id: destination, position } : task)
        .sort((left, right) => Number(left.position) - Number(right.position)));
      await movePipelineTask(taskId, destination);
      setMessage(successMessage);
    } catch {
      setTasks((all) => all
        .map((task) => task.id === taskId ? current : task)
        .sort((left, right) => Number(left.position) - Number(right.position)));
      setMessage("The move was not saved. Your card has been restored—please try again.");
    } finally {
      setSavingId(null);
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    if (!event.over) return;
    const overId = String(event.over.id);
    const destination = overId.startsWith("status-")
      ? overId.replace("status-", "")
      : tasks.find((task) => task.id === overId)?.status_id;
    const current = tasks.find((task) => task.id === taskId);
    if (!destination || !current || current.status_id === destination) return;
    await saveMove(taskId, destination, `${current.title} moved successfully.`);
  }

  function completeTask(task: PipelineTask) {
    if (!postedStatus) {
      setMessage("The Posted / Done status is unavailable.");
      return;
    }
    void saveMove(task.id, postedStatus.id, `${task.title} marked Posted / Done.`);
  }

  return (
    <>
      <div className="pipeline-toolbar"><p>Drag assets between active stages. Use the checkmark in Ready To Post to complete an asset.</p>{message && <span role="status">{message}</span>}</div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="pipeline-board">
          {visibleStatuses.map((status) => <Column key={status.id} status={status} tasks={byStatus.get(status.id) ?? []} savingId={savingId} onComplete={completeTask} />)}
        </div>
      </DndContext>
    </>
  );
}
