# Automatic deliverables and ClickUp assets

AutoPacific job saves create real tasks for each dated deliverable. The same
transaction handles normal editors, Marketing briefs and weekly campaigns.
Stable `source_deliverable_id` values connect renames to the original task, so
status, logged hours, notes and history survive. Due dates use the deliverable's
date first, otherwise the job deadline, otherwise no date. Removing a deliverable
does not delete its task; archived tasks are not recreated, and closed jobs do
not gain new outstanding work. Deferred generation lets explicit clone/reschedule
copies finish before inserting missing tasks.

## One-way child mirroring

Eligible AutoPacific jobs assigned to the primary videographer continue using
the existing parent-job sync. Once the parent has a stable ClickUp mapping,
active attached CRM tasks mirror as real ClickUp subtasks in the same Jobs List.
Their title, deadline, priority, notes, hours summary and status are outbound-only.
Parent job conflict detection and inbound imports remain unchanged; ClickUp
subtasks are never imported as CRM jobs.

| CRM task | ClickUp |
| --- | --- |
| Not Started | SCHEDULED (PLANNING when the parent is Planning) |
| In Progress | EDITING |
| Ready For Revision / Final Draft/Notes / Ready To Post | APPROVAL |
| Posted / Done | COMPLETE |
| Delayed | DELAYED |

The existing outbox coalesces edits, with no additional polling. A payload hash
skips unchanged children. A service-only mapping stores each remote ID, and a
short workspace lease serializes reparenting. Reassignment retains the ClickUp
subtask ID. CRM removal archives only mapped remote children; manually created
ClickUp subtasks are never modified. Generated descriptions contain no CRM
backlink.

Creation is reserved in Postgres before POSTing to ClickUp. If the response is
uncertain, retries recover the exact workspace/task marker instead of blindly
repeating the create. Unconfirmed or duplicate identities stop for review.
Batches are bounded to 20 child mutations / approximately 45 seconds; deferred
work does not consume the failure retry allowance. No database transaction is
held open across external HTTP calls.

## Release and recovery

1. Apply the additive migration, with `sync_subtasks` initially false.
2. Run both rollback-only SQL fixtures and the automated TypeScript/tests/build.
3. Release and verify the new production worker.
4. Enable `sync_subtasks` on the existing integration; queue a stable pilot job.
5. Verify child mappings and ignored inbound webhooks, then queue remaining
   eligible jobs with attached tasks. Do not force unresolved parent conflicts.

To pause child mirroring, set the integration's `sync_subtasks` false. Retain
the mapping table and reservations; do not delete them to retry a failed create.
This pause does not disable parent-job syncing or automatic deliverable tasks.
Check `website-clickup-subtask-links.last_error` and the existing sync outbox /
audit records for recovery details. The mapping and lease RPC are inaccessible
to anonymous and authenticated browser clients.
