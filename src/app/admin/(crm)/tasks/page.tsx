import { CalendarDays, Clock3, Pencil, Plus } from "lucide-react";
import { createTask, updateTask } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { getAdminContext, getPipeline } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";
import type { PipelineTask, TaskStatus } from "@/lib/types";

export default async function TasksPage() {
  const [data, context] = await Promise.all([getPipeline(), getAdminContext()]);
  if (!context) return null;
  const { data: jobs } = await context.supabase.from("website-jobs").select("id,title").is("archived_at", null).order("title");
  return (
    <>
      <PageHeader eyebrow="Created assets" title="Tasks / Assets" description="Plan every deliverable, assign its hours and due date, then move it through the production pipeline." actions={
        <ActionPopover action={createTask} summary={<><Plus size={16} /> New asset</>} title="Create a task / asset" formClassName="quick-form wide">
          <label>Title<input name="title" required /></label>
          <label>Job<select name="job_id" required><option value="">Choose job</option>{(jobs ?? []).map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
          <label>Status<select name="status_id" required>{data.statuses.map((status: TaskStatus) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label>Asset type<input name="asset_type" placeholder="Reel, photo set, edit…" /></label>
          <label>Hours<input name="hours" type="number" min="0" step="0.25" /></label>
          <label>Due date<input name="due_date" type="date" /></label>
          <label>Priority<select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
          <label className="form-span">Description<textarea name="description" rows={3} /></label>
          <SubmitButton pendingLabel="Creating…">Create asset</SubmitButton>
        </ActionPopover>
      } />
      {data.tasks.length ? <div className="task-status-groups">
        {data.statuses.map((status: TaskStatus) => {
          const tasks = data.tasks.filter((task: PipelineTask) => task.status_id === status.id);
          return <section className="task-status-group" key={status.id}>
            <header><span className="status-dot" style={{ background: status.color }} /><div><h2>{status.label}</h2><p>{tasks.length} {tasks.length === 1 ? "asset" : "assets"}</p></div><b>{String(status.position).padStart(2, "0")}</b></header>
            {tasks.length ? <div className="task-list">
              {tasks.map((task: PipelineTask) => <article className="task-list-card" key={task.id}>
                <div className="task-list-heading"><div><p>{task.job?.client?.name ?? "No client"}</p><h3>{task.title}</h3><span>{task.job?.title ?? "Unlinked job"}</span></div><span className={`task-priority priority-${task.priority}`}>{task.priority}</span></div>
                <div className="task-list-meta"><span><Clock3 size={14} /> {task.hours == null ? "Hours unset" : `${Number(task.hours).toFixed(2)}h`}</span><span><CalendarDays size={14} /> {formatDate(task.due_date)}</span><span>{task.asset_type ?? "Asset type unset"}</span></div>
                <details className="inline-editor task-editor"><summary><Pencil size={14} /> Edit asset</summary>
                  <form action={updateTask} className="quick-form wide">
                    <input type="hidden" name="id" value={task.id} /><h3>Edit asset</h3>
                    <label>Title<input name="title" required defaultValue={task.title} /></label>
                    <label>Job<select name="job_id" required defaultValue={task.job_id}>{(jobs ?? []).map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
                    <label>Status<select name="status_id" required defaultValue={task.status_id}>{data.statuses.map((item: TaskStatus) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                    <label>Asset type<input name="asset_type" defaultValue={task.asset_type ?? ""} /></label>
                    <label>Hours<input name="hours" type="number" min="0" step="0.25" defaultValue={task.hours ?? ""} /></label>
                    <label>Due date<input name="due_date" type="date" defaultValue={task.due_date ?? ""} /></label>
                    <label>Priority<select name="priority" defaultValue={task.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                    <label className="form-span">Description<textarea name="description" rows={3} defaultValue={task.description ?? ""} /></label>
                    <SubmitButton pendingLabel="Saving…">Save asset</SubmitButton>
                  </form>
                </details>
              </article>)}
            </div> : <p className="task-group-empty">No assets in this stage.</p>}
          </section>;
        })}
      </div> : <EmptyState title="No created assets yet" description="Add a task to a job. It will appear here and on the drag-and-drop pipeline." />}
    </>
  );
}
