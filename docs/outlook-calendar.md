# Private Outlook calendar subscription (AutoPacific)

## User flow

Sign in to AutoPacific using the account whose calendar should display the events. Open Calendar → Outlook calendar (calendar-sync icon on mobile). Enter a label and the published **ICS subscription URL**, then connect. Do not use the HTML sharing URL or a downloaded file.

The feed remains private to that login inside the CRM. It is not exposed to Marketing, the team view, the main TruShot CRM calendar or the TruShot `/tablet` workspace. AutoPacific My Space, Today and its authenticated kiosk can display the owner's imported events. Outlook events remain read-only even in edit mode and do not generate CRM push reminders. The separately approved ClickUp bridge shares only the configured owner's titles, locations and times with the destination list (see below).

Refresh now checks the feed, with a one-minute cooldown. Disconnect removes only the local connection and imported snapshot; it does not change Outlook. Revoke the published URL in Outlook if the URL itself was disclosed.

## Storage and access

- `website-outlook-calendars`: one snapshot per workspace/login. Authenticated SELECT grants cover explicit safe columns only. RLS requires the owner and active workspace/portal access, including the existing portal MFA requirements. Browser sessions cannot insert, update or delete snapshots.
- `website-outlook-feed-secrets`: service-only, RLS enabled, no anon/authenticated grants. Stores AES-256-GCM encrypted feed URL, authenticated with an Outlook-specific AAD, and HTTP validators. Fresh random nonce per encryption.
- `OUTLOOK_CALENDAR_ENCRYPTION_KEY`: dedicated 32-byte hexadecimal server secret in Vercel Production. Never use a NEXT_PUBLIC prefix. Keep it stable; replacing it requires reconnecting existing feeds. Do not log URLs or retrieve this secret into browser/local diagnostics.
- Mutations authenticate via `getProductionContext`, derive ownership from the verified session, require same-origin POST and scope every service-role mutation to that owner. The scheduler is the only owner-independent worker.

## Fetch, parsing and refresh

Only HTTPS Microsoft Outlook publishing hosts and `/owa/calendar/.../calendar.ics` paths are accepted. Each redirect is revalidated; other hosts, credentials, ports, IPs, HTML responses and oversized/incomplete feeds are rejected. Maximum download: 2 MiB; timeout: 12 seconds; maximum two redirects. The parser never fetches embedded URLs.

Pinned `node-ical` supports Windows/IANA time zones, recurring events, exclusions and moved/cancelled instances. Import window: one year before to one year after today, within Outlook's published coverage. Up to 1,000 source VEVENTs and 2,000 expanded occurrences; excessive/sub-daily recurrence rules fail closed rather than partially replacing good data. All-day exclusive end dates become CRM-inclusive finishes. Floating times use Brisbane; timed events display in Brisbane.

Uses the existing authenticated quarter-hour reminder scheduler; no extra cron or per-tab feed polling. Conditional HTTP requests avoid unchanged downloads. Recurrences are re-expanded daily. Lease tokens, refresh cooldowns and optimistic writes prevent concurrent refreshes or resurrection after disconnect. Snapshots replace atomically; cancelled/deleted entries disappear only after a successful complete parse. Failed downloads retain last good data and back off to a maximum four-hour retry interval. HTTP validators advance only after the snapshot saves.

## Verification

Tests cover recurrence overrides/exclusions/cancellations, DST, floating/all-day dates, private error redaction, SSRF redirects, payload limits, encryption authentication, owner-scoped mutations, cooldown/lease behaviour, failed-refresh retention, validator ordering and read-only rendering. Live rollback-only SQL checks verify owner access, cross-user denial, MFA enforcement, no anonymous access, no browser writes and service-only credentials.

The migration is additive. Existing jobs, tasks, native events, flights, notifications and ClickUp records are not modified. Rollback: deploy the preceding application version; leave the unused protected tables in place until an explicit data-removal decision.

## One-way Outlook → ClickUp bridge

- Explicit service-only configuration in `website-clickup-outlook-bridge`, disabled by default. Production approval is for John and destination list **1300350000012117**, not the Jobs list **1300350000002054**. The existing ClickUp profile/primary-videographer assignment is rechecked. No Microsoft write access is added.
- Publishes ongoing/upcoming occurrences from the existing complete Outlook snapshot. Does not backfill past appointments. Already mirrored events remain managed after their finish and become the list's closed status on the next quarter-hour scheduler run, even if the ICS feed returns 304. All-day events complete after their inclusive final day. A rescheduled future event reopens the same task.
- Task name `[OUTLOOK] <actual title>`; description includes location and times, plus a stable non-secret mirror marker. Private appointment descriptions, attendees, attachments, feed URLs and credentials are never copied. The destination's ClickUp permissions determine who sees copied details; assignment alone is not privacy.
- The scheduler imports Outlook before running the bridge. No extra cron, tab polling or dependency. Payload hashes skip unchanged events. Short service-only leases, bounded batches and retry backoff protect usage and concurrent runs. An owner-only same-origin POST and “Sync ClickUp now” button support manual checks, with a cooldown.
- Source format v2 preserves a single meeting's identity across date changes and recurring exceptions across moved start times. CRM subscription UIDs are excluded; inbound ClickUp ignores Outlook markers. No native CRM jobs/events are created for Outlook copies and no Outlook copies go back into the CRM-published ICS feed.
- Successful source removal/cancellation/disconnect archives the owned ClickUp task, never deletes the original appointment. A failed import keeps the good snapshot. Service-only link tombstones survive disconnect for cleanup. Each remote task must still be in the configured list and carry the expected identity before it is updated or archived.
- A reservation is persisted before creating a task. If the POST response or local save is lost, subsequent runs recover by the marker from the destination list (including archived items). An unconfirmed create is NOT blindly repeated. If identity recovery is ambiguous, the bridge stops safely; a service operator must review it.
- Disable `enabled` to pause outbound work before rolling back code. No new browser grants, public policies or security-definer functions are introduced. New tables have RLS and service-role-only grants; source URL encryption/access is unchanged.
