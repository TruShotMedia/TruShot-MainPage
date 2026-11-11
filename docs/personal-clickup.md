# Personal ClickUp list connections

## Set up a person

AutoPacific → Manage team → enable and save the member → expand **Personal
ClickUp list** → paste their full list URL → **Check list** → confirm the matching
ClickUp person and the six status mappings → **Connect verified list**.

The existing server API account must already be allowed to access the destination
list. This feature never grants ClickUp membership or asks for a member's password.
The person is suggested only on an exact, case-insensitive business-email match;
otherwise the manager chooses an authorised workspace member explicitly.

Use a distinct destination status for Planning, Scheduled, In production, Client
review, Delayed and Completed. Completed must be a closed/done status. Status
names may differ between lists; ambiguous mappings cannot be connected.

John's primary Jobs list (`1300350000002054`) and Outlook list
(`1300350000012117`) are reserved in both server validation and database guards.
The primary videographer's connection cannot be edited through this feature.
Neither legacy integration configuration, link identity, conflict record nor
webhook is migrated into the new system. Its existing behaviour is retained.

## What syncs

- Only non-archived AutoPacific jobs/assets explicitly assigned to that person
  are mirrored. Followers, mentions and whoever created a record are not routing
  criteria. Disabled members and paused connections do not sync.
- A shared job stays one CRM record and has a separate mirror per connected list.
  A task is a ClickUp subtask only when its assigned parent job has a mirror in
  that same list. Otherwise it is a standalone asset with its job in the brief.
- Titles, dates/times and stages sync in both directions. Assets retain their
  finer CRM review stage when a remote rename does not change the mapped stage.
  Job stages controlled by linked assets cannot be overridden by a remote parent
  stage change. Progress continues to use the existing weighted calculation.
- Structured briefs, files, assignments, priority and progress remain CRM-owned.
  A newly imported native ClickUp item copies its initial plain-text description;
  subsequent remote brief/assignment/parent edits are held for review, not silently
  flattened over CRM data. Private attachment back-links are not generated.
- New top-level ClickUp items assigned to the matched person become jobs. New
  subtasks become linked assets; their parent must be assigned/linked to that
  person. Arbitrary orphan/nested subtasks are not invented as unrelated jobs.
- Empty custom asset deadlines inherit the parent job deadline, including when
  a remote custom date is cleared. An explicit custom date remains an override.
- A CRM removal/reassignment archives its owned personal copy, retaining history.
  Deleting/archiving/unassigning a personal ClickUp copy never deletes a shared
  CRM record; its mirror is held for review. Pausing retains provider history.

Existing assigned work is queued on connection. Signed, per-list webhooks and
after-response updates normally start syncing promptly. The existing scheduled
reminder run also reconciles missed events, with 15-minute list-scan intervals,
persistent pagination watermarks and rolling checks for moved/deleted mirrors.
**Sync now** requests a bounded reconciliation; **Refresh status** only reads
status. Large backlogs or rate limiting may require subsequent batches.

## Conflict and retry behaviour

Concurrent shared-field edits are held for review. Manage team shows per-record
issues and offers a safe Retry or an explicit choice of the CRM / ClickUp shared
version. A manager's choice is pinned to the reviewed remote hash; newer changes
are not overwritten. Incoming mutations compare-and-swap the current source and
parent timestamps inside a row-locked database transaction.

Every remote create has a durable reservation before POST. An ambiguous timeout
is recovered by a connection/record/generation marker rather than blindly posted
again. Imported remote IDs are claimed transactionally with their CRM records.
Subtask reparenting archives and retains the previous generation before creating
the replacement, because ClickUp's task-update API does not reparent tasks.
Unknown third-party children prevent parent archival. Bounded incomplete recovery
scans fail closed and can require manual review; they do not guess a missing ID.

## Security and resource limits

Manager-only, MFA-aware server actions revalidate the URL, actual workspace Space,
API access, assignee and status mapping on Save. Browser input is never used as a
fetch origin. All seven new tables have RLS and explicit privilege revocation;
browser roles cannot write connection metadata or call privileged workers.
Only managers can read connection summaries. Webhook secrets remain encrypted
and service-only; signatures and revision idempotency are verified before queueing.

Personal webhooks use `/api/integrations/clickup/personal-webhook`, separate from
the primary registration's endpoint. Replacing a personal webhook never deletes
another list's registration. Leases are per connection, rechecked before provider
requests, and prevent configuration changes racing a worker. A workspace-wide
personal request budget caps background personal traffic at 20 calls per minute;
the existing primary workers are not reconfigured. Dirty queues coalesce updates
and acknowledge only the processed revision. Unchanged data is not rewritten.
Webhook receipts are pruned in bounded batches after 30 days.

Verification covers model/worker/action/component tests, read-only privilege
inspection, and rollback-only hosted routing/import/lease/RLS checks. The full
SQL suite is `supabase/tests/personal_clickup.sql`; no live test list is configured
and no provider task is created until a manager connects a real destination.
