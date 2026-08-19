import { Plus } from "lucide-react";
import { createTask } from "@/app/admin/actions";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { getAdminContext, getPipeline } from "@/lib/data/admin";
import { formatDate } from "@/lib/format";

export default async function TasksPage() {
  const [data, context] = await Promise.all([getPipeline(), getAdminContext()]);
  if (!context) return null;
  const { data: jobs } = await context.supabase.from("website-jobs").select("id,title").is("archived_at", null).order("title");
  return (
    <>
      <PageHeader eyebrow="Created assets" title="Tasks / Assets" description="Plan every deliverable, assign its hours and due date, then move it through the production pipeline." actions={
        <details className="action-popover"><summary className="admin-primary-button"><Plus size={16} /> New asset</summary><form action={createTask} className="quick-form wide"><h3>Create a task / asset</h3><label>Title<input name="title" required /></label><label>Job<select name="job_id" required><option value="">Choose job</option>{(jobs ?? []).map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><label>Status<select name="status_id" required>{data.statuses.map((status: Record<string, unknown>) => <option key={status.id as string} value={status.id as string}>{status.label as string}</option>)}</select></label><label>Asset type<input name="asset_type" placeholder="Reel, photo set, edit…" /></label><label>Hours<input name="hours" type="number" min="0" step="0.25" /></label><label>Due date<input name="due_date" type="date" /></label><button className="admin-primary-button" type="submit">Create asset</button></form></details>
      } />
      {data.tasks.length ? <section className="admin-card table-card"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Asset</th><th>Job</th><th>Client</th><th>Status</th><th>Type</th><th>Due</th><th>Hours</th></tr></thead><tbody>
        {data.tasks.map((task: Record<string, unknown>) => { const job = task.job as { title?: string; client?: { name?: string } | null } | null; const status = data.statuses.find((entry: Record<string, unknown>) => entry.id === task.status_id) as Record<string, unknown> | undefined; return <tr key={task.id as string}><td><strong>{task.title as string}</strong></td><td>{job?.title ?? "—"}</td><td>{job?.client?.name ?? "—"}</td><td><span className="status-dot" style={{ background: status?.color as string }} /> {String(status?.label ?? "—")}</td><td>{String(task.asset_type ?? "—")}</td><td>{formatDate(task.due_date as string)}</td><td>{task.hours == null ? <span className="warning-text">Unset</span> : `${Number(task.hours).toFixed(2)}h`}</td></tr>; })}
      </tbody></table></div></section> : <EmptyState title="No created assets yet" description="Add a task to a job. It will appear here and on the drag-and-drop pipeline." />}
    </>
  );
}
