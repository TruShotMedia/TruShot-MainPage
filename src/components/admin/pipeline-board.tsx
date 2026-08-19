"use client";

import { useMemo, useState } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Clock3, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import type { PipelineTask, TaskStatus } from "@/lib/types";

function TaskCard({ task }: { task: PipelineTask }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? .45 : 1 }} className="pipeline-task">
      <button className="drag-handle" {...listeners} {...attributes} aria-label={`Move ${task.title}`}><GripVertical size={15} /></button>
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

function Column({ status, tasks }: { status: TaskStatus; tasks: PipelineTask[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-${status.id}` });
  return (
    <section ref={setNodeRef} className={`pipeline-column ${isOver ? "is-over" : ""}`}>
      <header><span style={{ background: status.color }} /><h2>{status.label}</h2><b>{tasks.length}</b></header>
      <div className="pipeline-stack">
        {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
        {!tasks.length && <div className="pipeline-empty">Drop an asset here</div>}
      </div>
    </section>
  );
}

export function PipelineBoard({ initialStatuses, initialTasks }: { initialStatuses: TaskStatus[]; initialTasks: PipelineTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [message, setMessage] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));
  const byStatus = useMemo(() => new Map(initialStatuses.map((status) => [status.id, tasks.filter((task) => task.status_id === status.id)])), [initialStatuses, tasks]);

  async function onDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    if (!event.over) return;
    const overId = String(event.over.id);
    const destination = overId.startsWith("status-")
      ? overId.replace("status-", "")
      : tasks.find((task) => task.id === overId)?.status_id;
    const current = tasks.find((task) => task.id === taskId);
    if (!destination || !current || current.status_id === destination) return;

    setTasks((all) => all.map((task) => task.id === taskId ? { ...task, status_id: destination, position: Date.now() } : task));
    const { error } = await createClient().from("website-job-tasks").update({ status_id: destination, position: Date.now() }).eq("id", taskId);
    if (error) {
      setTasks((all) => all.map((task) => task.id === taskId ? current : task));
      setMessage("That move could not be saved. The card was restored.");
    } else {
      setMessage(`${current.title} moved successfully.`);
    }
  }

  return (
    <>
      <div className="pipeline-toolbar"><p>Drag assets between stages. Changes save immediately.</p>{message && <span role="status">{message}</span>}</div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="pipeline-board">
          {initialStatuses.map((status) => <Column key={status.id} status={status} tasks={byStatus.get(status.id) ?? []} />)}
        </div>
      </DndContext>
    </>
  );
}
