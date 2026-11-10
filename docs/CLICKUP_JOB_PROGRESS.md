# ClickUp calendar progress

ClickUp mirrors use `[80% · 0/5 done] Job title` so weighted workflow progress is
visible at the start of calendar cards. Standalone jobs use `[50% · status]`.
The CRM job title is never changed. Inbound comparison understands both these
prefixes and the original `[3/4 · 75%]` format.

## Counting

- Only non-archived linked tasks are loaded, scoped to the job and workspace.
- Task-stage weights: Not Started 0%, In Progress 40%, Ready For Revision 70%,
  Final Draft/Notes 90%, Ready To Post 95%, Posted / Done 100%.
- Average the active task stages equally; only `posted_done` counts as complete.
  Delayed historical attempts are excluded; unknown stages safely count as 0%.
- Unconverted brief deliverables count as outstanding work.
- A deliverable and its generated task count once, using `source_deliverable_id`.
- Without tasks/deliverables, use job-stage progress: Planning 0%, Scheduled 10%,
  In Production 50%, Client Review 90%, Delivered 100%.
- This is workflow progress, not hours spent or a time-to-completion estimate.

## Automatic job stages (AutoPacific and Marketing)

`20261110005145_autopacific_task_driven_job_status.sql` stores the parent job's
stage from its **least-advanced non-archived, non-delayed linked task**:

| Least task stage | Job stage |
| --- | --- |
| Not Started (or unknown) | Scheduled |
| In Progress | In Production |
| Ready For Revision / Final Draft/Notes / Ready To Post | Client Review |
| All Posted / Done | Delivered |

Planning is a manual readiness gate so automatically generated deliverables do
not schedule undated briefs. Moving out of Planning activates the rollup.
Historical delayed jobs are never resurrected. Reopening, archiving, restoring,
deleting or reparenting a task recalculates the affected parent(s), backwards as
well as forwards. Removing the last active task leaves the current job stage
unchanged and returns it to manual control. Other clients remain manual.

This is a workflow stage, distinct from the weighted percentage: a job can be
80% progressed overall while its slowest task keeps it In Production.

Private database triggers enforce the rule for all write paths, including
Marketing approvals, campaign saves, offline replays and ClickUp imports. The UI
labels automatic jobs and disables manual status/drag/completion controls for
them; brief editing, duplication and the rescheduling workflow still work.

## Synchronisation safety

Shared-state comparison strips the validated generated prefix for linked jobs.
An unlinked task imported from ClickUp retains its original title. Real title,
status and date edits still go through the existing bidirectional conflict
guards. A progress-only patch never sends a status or date change.

The private task trigger reuses the existing coalescing job outbox for inserts,
completion/reopening, reparenting, archiving/restoring and deletes. Only enabled
AutoPacific jobs assigned to the connected primary videographer are queued.
An update irrelevant to progress does not create queue traffic. A weighted
progress-only change does not touch the parent. A derived **stage** change does
update the parent's normal status/timestamp and durable ClickUp queue. No new
polling is added, and no RLS policy is relaxed.
Normal task actions and offline replays wake the existing dispatcher after
the response. A task lookup failure retries instead of exporting false zeroes.
ClickUp parent status overrides cannot outrun linked CRM tasks: the inbound
baseline is retained and the existing outbound queue restores the derived stage.
Real simultaneous edits still retain the normal conflict protections.

Run `supabase/tests/task_driven_job_status.sql` for rollback-only verification of
all stage mappings, completion/reopening, last-task removal, reparent/bulk
changes, automatic deliverable creation, planning, rescheduling chains,
authenticated RLS, Marketing approval, client isolation and function privileges.

## Release order

1. Deploy the title-compatibility commit first, before any decorated names exist.
2. Verify the migration and temporary fixture tests in a rollback transaction.
3. Apply `20261103210012_clickup_job_progress.sql`, matching the server migration
   history version. Run `supabase/tests/clickup_job_progress.sql` against the
   installed trigger; it rolls back all fixtures and checks private privileges.
4. Deploy the progress writer and task-action wakeups.
5. Queue existing linked, active AutoPacific jobs with tasks/deliverables for one
   refresh, restricted to the primary videographer. Do not touch job records.
6. Run the normal dispatcher, verify real ClickUp names and canonical CRM titles,
   then inspect sync errors/conflicts. No ClickUp API token belongs in a client.

If a release needs rollback, use the compatibility build from step 1 so inbound
sync continues to understand progress-decorated titles.
