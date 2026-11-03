# ClickUp calendar progress

ClickUp mirrors use `[3/4 · 75%] Job title` so the progress is visible at the
start of calendar cards. The CRM job title is never changed. Jobs with no
active tasks or brief deliverables keep their plain title.

## Counting

- Only non-archived linked tasks are loaded, scoped to the job and workspace.
- `posted_done` is complete. Delayed/unknown statuses are not treated as done.
- Unconverted brief deliverables count as outstanding work.
- A deliverable and its generated task count once, using `source_deliverable_id`.
- Removing the final task removes the prefix unless brief deliverables remain.

## Synchronisation safety

Shared-state comparison strips the validated generated prefix for linked jobs.
An unlinked task imported from ClickUp retains its original title. Real title,
status and date edits still go through the existing bidirectional conflict
guards. A progress-only patch never sends a status or date change.

The private task trigger reuses the existing coalescing job outbox for inserts,
completion/reopening, reparenting, archiving/restoring and deletes. Only enabled
AutoPacific jobs assigned to the connected primary videographer are queued.
An update irrelevant to progress does not create queue traffic. No parent job
timestamp is touched, no new polling is added, and no RLS policy is relaxed.
Normal task actions and offline replays wake the existing dispatcher after
the response. A task lookup failure retries instead of exporting false zeroes.

## Release order

1. Deploy the title-compatibility commit first, before any decorated names exist.
2. Run `supabase/tests/clickup_job_progress.sql` together with the new migration
   inside its rollback transaction. This includes temporary fixtures only.
3. Apply `20261103022307_clickup_job_progress.sql` and verify trigger privileges.
4. Deploy the progress writer and task-action wakeups.
5. Queue existing linked, active AutoPacific jobs with tasks/deliverables for one
   refresh, restricted to the primary videographer. Do not touch job records.
6. Run the normal dispatcher, verify real ClickUp names and canonical CRM titles,
   then inspect sync errors/conflicts. No ClickUp API token belongs in a client.

If a release needs rollback, use the compatibility build from step 1 so inbound
sync continues to understand progress-decorated titles.
