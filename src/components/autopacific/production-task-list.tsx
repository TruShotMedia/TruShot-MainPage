"use client";

import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3, Copy, ListTodo } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { PipelineTask, TaskStatus } from "@/lib/types";

export function ProductionTaskList({ tasks, statuses, completed, onOpen, onStart, onDuplicate, startingId }: {
  tasks: PipelineTask[]; statuses: TaskStatus[]; completed: boolean;
  onOpen: (task: PipelineTask) => void; onStart?: (task: PipelineTask) => void;
  onDuplicate?: (task: PipelineTask) => void; startingId?: string | null;
}) {
  return <div className="apg-task-list" aria-label={completed ? "Completed tasks" : "Planning tasks"}>
    {!tasks.length ? <div className="apg-empty-state"><span>{completed ? <Check size={24} /> : <ListTodo size={24} />}</span><h2>{completed ? "Nothing completed yet" : "Your planning list is clear"}</h2><p>{completed ? "Completed assets will stay here for reference." : "Tasks in Not Started appear here until you’re ready to begin."}</p></div> : tasks.map(task => <article key={task.id} className={completed ? "is-completed" : ""}>
      <button type="button" className="apg-task-list-primary" onClick={() => onOpen(task)} aria-label={`View details for ${task.title}`}>
        <span className="apg-task-list-icon">{completed ? <Check size={19} /> : <ListTodo size={19} />}</span>
        <span className="apg-task-list-copy"><small>{task.job?.title ?? "Unlinked job"}</small><strong>{task.title}</strong><span className="apg-task-list-meta"><span><CalendarDays size={13} /> {completed ? `Completed ${formatDate((task.completed_at ?? task.updated_at).slice(0, 10))}` : `Due ${formatDate(task.due_date)}`}</span><span><Clock3 size={13} /> {task.hours == null ? "Hours unset" : `${task.hours}h`}</span></span></span>
        <span className={`apg-stage-label ${completed ? "is-complete" : ""}`}>{statuses.find(status => status.id === task.status_id)?.label}</span><ChevronRight size={17} />
      </button>
      {onStart || onDuplicate ? <div className="apg-task-list-actions">
        {onDuplicate ? <button type="button" className="apg-task-copy" onClick={() => onDuplicate(task)} aria-label={`Duplicate ${task.title}`}><Copy size={15} /><span>Duplicate</span></button> : null}
        {onStart ? <button type="button" className="apg-task-start" onClick={() => onStart(task)} disabled={!!startingId} aria-label={`Move ${task.title} to In Progress`}>{startingId === task.id ? "Moving…" : "Move to In Progress"}<ArrowRight size={15} /></button> : null}
      </div> : null}
    </article>)}
  </div>;
}
