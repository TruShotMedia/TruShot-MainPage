# AutoPacific / Marketing personal notifications

## Audience

The shared in-app comments feed includes only the signed-in person's assigned
job/task, explicitly followed item, or a comment mentioning them. Item visibility
alone is not a notification subscription. A task uses its own assignments and
followers, not its parent's. Existing notes and revision-based read receipts are
retained. Own comment writes/edits do not become unread updates for the writer.

Calendar device reminders use assignment/following for AutoPacific jobs/tasks;
events, flights and campaign assets retain their explicit assignment checks.
AutoPacific reminders require an AutoPacific-scoped device registration, even
for a full-CRM administrator assigned to or following the work. Unscoped TruShot
registrations never receive AutoPacific work. Registration records the selected
app independently of the person's access tier. Opening another app does not
silently unsubscribe or move a same-browser registration; enabling alerts there
explicitly selects that experience. Separate installed apps should each enable
their own alerts. Unrelated TruShot workspace reminders keep their existing policy. Disabled
accounts are excluded; a separate active full-CRM membership remains authorised.
One endpoint match is sent once regardless of overlapping interest reasons.
Empty audiences do not create failed-delivery reservations or pointless retries.

This change does not add native comment push: discussion updates remain in the
in-app bell, with the existing device reminders for scheduled work.
Imported Outlook events remain read-only calendar content and do not currently
create push reminders. Their ClickUp bridge does not enable reminder delivery.

## Following

`website-work-record-followers` stores per-user, per-item interest separately
from `assignee_ids`. New explicit mentions follow that exact job/task atomically
with the note write. A selected existing active team member is required. There
is no automatic parent/child following, role change, assignment, or ClickUp queue.
Existing valid AutoPacific mentions are backfilled without changing note text.

Users can Follow/Following from the internal-notes header in view or edit mode.
Unfollowing stores a false preference. Editing an unchanged old @mention does
not override it; a NEW explicit mention follows again. A direct mention is still
visible even while otherwise unfollowed. Assignment-based reminders still apply.

Following grants NO record access or edit permission. Caller-scoped RLS checks
require authorised, non-archived AutoPacific work. Browser roles can read/change
only their own preferences; protected identity columns cannot be updated. The
public setter is security-invoker and derives user identity from `auth.uid()`.
The only privileged mention trigger is in the private schema with direct execute
revoked; it checks the saved note's record scope and active team membership.
Foreign keys clean up deleted job/task/user references. No new polling is added.

Inbox clicks fetch authorised current details, including items from tabs not yet
loaded. A failure stays actionable and does not acknowledge an unseen comment.

## Verification / rollback

`supabase/tests/production_followers.sql` tests real authenticated Marketing RLS,
mention-following, independent tasks, unfollow/new mentions, unchanged assignees,
read receipts, no edit-right escalation, deleted records and disabled accounts.
It creates rollback-only fixtures and never disables an existing team member.
Unit/component tests cover reminder dispatch, self-scoped server actions, follow
UI errors and unread-preserving navigation. No client-request, Outlook, ClickUp
destination, calendar schedule or reminder-setting values are changed.

The database change is additive and the comment-feed RPC shape is unchanged.
To roll back presentation code, leave the new preference table in place; do not
drop user preferences. Restoring the previous feed deliberately restores its
broader audience and should be an explicit product decision.

## Per-person ClickUp lists

The separate two-way personal-connection implementation is documented in
`docs/personal-clickup.md`. The original design constraints below explain the
separation from the primary integration; following is still not ClickUp routing.

The current job integration is workspace-wide and tied to the primary
videographer. Its links and inbound webhook are not multi-person routing.
An optional team-member URL must therefore be a validated connection, not an
unverified redirect of the existing integration. A safe implementation should:

1. Parse/validate a supported ClickUp list URL, verify API access, resolve the
   destination's statuses and associate a confirmed ClickUp person ID. Keep the
   service credential server-only and manager configuration separate from roles.
2. Reserve John's Jobs list `1300350000002054` and Outlook list
   `1300350000012117`; neither changes when another member is configured.
3. Route explicit personal assignments, not follows or mentions. Use one canonical
   CRM record and separate per-connection mirror identities for shared jobs.
4. Mirror tasks as children only when their parent also has a mirror in that same
   list. Otherwise use a typed standalone task mirror; never import it as a job.
5. Support separate per-list webhook/signature/queue state, conflict detection,
   create recovery, deletions, account disablement and reassignment. No list URL
   should automatically expose another person's records or an Outlook snapshot.
6. Verify CRM-to-ClickUp first, then enable narrowly scoped inbound changes after
   testing mappings/ownership. Do not claim the connection is two-way while only
   outbound mirroring has been implemented.
