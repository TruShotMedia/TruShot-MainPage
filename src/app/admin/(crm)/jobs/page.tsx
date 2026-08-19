import { Info, Plus } from "lucide-react";
import { createJob } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { StatusGroupedTable } from "@/components/admin/status-grouped-table";
import { SubmitButton } from "@/components/admin/submit-button";
import { getAdminContext, getJobs } from "@/lib/data/admin";
import type { JobRecord, JobStatus, SelectOption } from "@/lib/types";

export default async function JobsPage() {
  const [jobs, context] = await Promise.all([getJobs(), getAdminContext()]);
  if (!context) return null;
  const [{ data: clients }, { data: statuses }] = await Promise.all([
    context.supabase.from("website-clients").select("id,name").is("archived_at", null).order("name"),
    context.supabase.from("website-job-statuses").select("id,key,label,color,position,is_closed").eq("is_active", true).order("position"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Production" title="Jobs" description="Every job is grouped by status. Select rows for bulk updates, or drag a row directly into its next stage." actions={
        <ActionPopover action={createJob} summary={<><Plus size={16} /> New job</>} title="Create a job" formClassName="quick-form wide">
          <label>Job title<input name="title" required /></label>
          <label>Client<select name="client_id"><option value="">No client yet</option>{(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label>Status<select name="status_id" required>{(statuses ?? []).map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label>Shoot date<input name="shoot_date" type="date" /></label>
          <label>Due date<input name="due_date" type="date" /></label>
          <label>Photos delivered<input name="photos_delivered" type="number" min="0" defaultValue="0" /></label>
          <SubmitButton pendingLabel="Creating…">Create job</SubmitButton>
        </ActionPopover>
      } />
      <div className="formula-note"><Info size={17} /><p><strong>How the numbers work:</strong> hours sum task hours; created assets count tasks; open tasks exclude Ready To Post and Posted / Done. Value allocates each linked invoice by this job’s share of total invoice hours.</p></div>
      {jobs.length ? (
        <StatusGroupedTable
          key={jobs.map((job) => `${job.id}:${job.updated_at}`).join("|")}
          kind="jobs"
          records={jobs as JobRecord[]}
          statuses={(statuses ?? []) as JobStatus[]}
          clients={(clients ?? []) as SelectOption[]}
        />
      ) : <EmptyState title="No jobs yet" description="Create the first job now, or continue to the CSV import once the base workflows are confirmed." />}
    </>
  );
}
