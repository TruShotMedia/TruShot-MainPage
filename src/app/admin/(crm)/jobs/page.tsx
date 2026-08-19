import { Info, Plus } from "lucide-react";
import { createJob } from "@/app/admin/actions";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { getAdminContext, getJobs } from "@/lib/data/admin";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function JobsPage() {
  const [jobs, context] = await Promise.all([getJobs(), getAdminContext()]);
  if (!context) return null;
  const [{ data: clients }, { data: statuses }] = await Promise.all([
    context.supabase.from("website-clients").select("id,name").is("archived_at", null).order("name"),
    context.supabase.from("website-job-statuses").select("id,label").eq("is_active", true).order("position"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Production" title="Jobs" description="One source of truth for the brief, dates, assets, hours, delivered photos and value of every job." actions={
        <details className="action-popover"><summary className="admin-primary-button"><Plus size={16} /> New job</summary><form action={createJob} className="quick-form wide"><h3>Create a job</h3><label>Job title<input name="title" required /></label><label>Client<select name="client_id"><option value="">No client yet</option>{(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Status<select name="status_id" required>{(statuses ?? []).map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label><label>Shoot date<input name="shoot_date" type="date" /></label><label>Due date<input name="due_date" type="date" /></label><label>Photos delivered<input name="photos_delivered" type="number" min="0" defaultValue="0" /></label><button className="admin-primary-button" type="submit">Create job</button></form></details>
      } />
      <div className="formula-note"><Info size={17} /><p><strong>How the numbers work:</strong> hours sum task hours; created assets count tasks; open tasks exclude Ready To Post and Posted / Done. Value allocates each linked invoice by this job’s share of total invoice hours.</p></div>
      {jobs.length ? <section className="admin-card table-card"><div className="admin-table-wrap"><table className="admin-table jobs-table"><thead><tr><th>Job</th><th>Status</th><th>Dates</th><th>Hours</th><th>Assets</th><th>Photos</th><th>Open</th><th>Value</th></tr></thead><tbody>
        {jobs.map((job: Record<string, unknown>) => { const client = job.client as { name?: string } | null; const status = job.status as { label?: string; color?: string } | null; return <tr key={job.id as string}><td><strong>{job.title as string}</strong><small>{client?.name ?? "No client"}</small></td><td><span className="status-dot" style={{ background: status?.color ?? "#777" }} /> {status?.label ?? "—"}</td><td><small>Shoot {formatDate(job.shoot_date as string)}</small><small>Due {formatDate(job.due_date as string)}</small></td><td><strong>{Number(job.hours ?? 0).toFixed(2)}</strong>{Boolean(job.has_unset_task_hours) && <small className="warning-text">Unset task hours</small>}</td><td>{String(job.created_assets ?? 0)}</td><td>{String(job.photos_delivered ?? 0)}</td><td><span className="count-pill">{String(job.open_tasks ?? 0)}</span></td><td><strong>{formatCurrency(Number(job.value_cents ?? 0))}</strong>{Boolean(job.allocation_needs_hours) && <small className="warning-text">Needs hours</small>}</td></tr>; })}
      </tbody></table></div></section> : <EmptyState title="No jobs yet" description="Create the first job now, or continue to the CSV import once the base workflows are confirmed." />}
    </>
  );
}
