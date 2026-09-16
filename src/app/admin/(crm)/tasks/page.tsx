import { Plus } from "lucide-react";
import { createTask } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { EmptyState } from "@/components/admin/empty-state";
import { JobSearchField } from "@/components/admin/job-search-field";
import { PageHeader } from "@/components/admin/page-header";
import { StatusGroupedTable } from "@/components/admin/status-grouped-table";
import { SubmitButton } from "@/components/admin/submit-button";
import { getPipeline } from "@/lib/data/admin";
import type { PipelineTask, TaskStatus } from "@/lib/types";

export default async function TasksPage() {
  const data = await getPipeline();
  return (
    <>
      <PageHeader eyebrow="Created assets" title="Tasks / Assets" description="Assets use the same grouped row workflow as jobs: select, update in bulk, edit, or drag between stages." actions={
        <ActionPopover action={createTask} summary={<><Plus size={16} /> New asset</>} title="Create a task / asset" formClassName="quick-form wide">
          <label>Title<input name="title" required /></label>
          <JobSearchField jobs={data.jobOptions} />
          <label>Status<select name="status_id" required>{data.statuses.map((status: TaskStatus) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label>Asset type<select name="asset_type" defaultValue="Asset" required><option value="Asset">Asset</option><option value="Other">Other</option></select></label>
          <label>Hours<input name="hours" type="number" min="0" step="0.25" /></label>
          <label>Due time<input name="due_time" type="time" /></label>
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
          jobs={data.jobOptions}
        />
      ) : <EmptyState title="No created assets yet" description="Add a task to a job. It will appear here and on the drag-and-drop pipeline." />}
    </>
  );
}
