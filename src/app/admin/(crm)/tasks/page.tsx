import { Plus } from "lucide-react";
import { createTask } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { StatusGroupedTable } from "@/components/admin/status-grouped-table";
import { SubmitButton } from "@/components/admin/submit-button";
import { getAdminContext, getPipeline } from "@/lib/data/admin";
import type { PipelineTask, SelectOption, TaskStatus } from "@/lib/types";

export default async function TasksPage() {
  const [data, context] = await Promise.all([getPipeline(), getAdminContext()]);
  if (!context) return null;
  const { data: jobs } = await context.supabase.from("website-jobs").select("id,title").is("archived_at", null).order("title");
  const jobOptions = (jobs ?? []).map((job) => ({ id: job.id, name: job.title }));
  return (
    <>
      <PageHeader eyebrow="Created assets" title="Tasks / Assets" description="Assets use the same grouped row workflow as jobs: select, update in bulk, edit, or drag between stages." actions={
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
      {data.tasks.length ? (
        <StatusGroupedTable
          key={data.tasks.map((task) => `${task.id}:${task.updated_at}`).join("|")}
          kind="tasks"
          records={data.tasks as PipelineTask[]}
          statuses={data.statuses as TaskStatus[]}
          jobs={jobOptions as SelectOption[]}
        />
      ) : <EmptyState title="No created assets yet" description="Add a task to a job. It will appear here and on the drag-and-drop pipeline." />}
    </>
  );
}
