# AutoPacific → Outlook subscription

## User setup

AutoPacific → Calendar → Outlook calendar → **Subscribe in Outlook**. Create and copy the private link, then in Outlook on the web choose Calendar → Add calendar → Subscribe from web. Paste the link, name it AutoPacific and save. Use a subscription, not a file import. An organisation can disable external subscriptions.

Outlook shows a separate read-only calendar, not entries written to the primary mailbox. This does not set Teams availability. Outlook controls refresh frequency; changes can take more than 24 hours. The existing Outlook → CRM import remains independent and unchanged.

The URL is displayed only immediately after creation/replacement. It is masked and never stored in browser storage. Copy before closing. Lost link: replace it, remove the old subscribed calendar in Outlook, and subscribe again. Revocation blocks further reads immediately at our endpoint, but cannot erase events already downloaded by Outlook. Keep the URL private: anyone holding it can read the exported information.

## Included data

- Only native records for the active **Autopacific Group** client, in the owner's workspace and assigned to that owner.
- Job shoots and job deadlines are separate entries, so lead time does not reserve weeks of busy time. Untimed shoots/deadlines are all-day. A timed shoot with no finish uses an explicitly labelled one-hour placeholder. Timed deadlines use a transparent 15-minute marker.
- Tasks/deliverables use their due date, falling back to the parent job's due date.
- Manual events and individual flight legs retain their start/finish window. Basic route, airline and flight number can appear; no booking reference, accommodation/vehicle notes or private notes are exposed.
- Rolling coverage: one year before and after today. Undated items and archived jobs/tasks are omitted. Delayed records are cancelled/transparent; completed job shoots are labelled completed.
- Never includes imported Outlook snapshots, INGREIGN/unrelated-client records, notes, comments, files, download links, invoices, assignee identities or push reminders.
- All native CRM times use Brisbane time. ICS date-times are published in UTC; all-day end dates are exclusive, per RFC 5545. Stable record-derived UIDs preserve identity across edits. Content is escaped and folded at 75 UTF-8 octets.

## Access and implementation

- `website-calendar-subscriptions`: one owner/workspace row, unique SHA-256 digest of a random 256-bit bearer token. Plaintext token/URL is never persisted server-side. No new encryption secret is needed.
- Authenticated SELECT is restricted to owner status metadata via RLS and existing active admin/AutoPacific team + MFA permissions. Token digests have no browser SELECT grant. No browser writes, no anonymous access.
- `GET/POST /api/calendar/subscription`: verified production session, manager/videographer (or existing full admin), same-origin mutation, bounded payload, owner taken only from claims. Create won't overwrite an existing subscription; replace/revoke are explicit and confirmed in UI.
- `GET /api/calendar/feed.ics?key=…`: no cookies/login required; validates/hashes the bearer token, then uses a service-only SECURITY INVOKER RPC. The RPC rechecks active account (not banned/deleted), active portal/team role or workspace admin, and explicit workspace/client/assignment filters on every read.
- Service-only function execution is revoked from PUBLIC/anon/authenticated. Only whitelisted output fields are projected. No imported-calendar table is queried.
- One bounded SQL query per Outlook poll, existing indexed workspace/client/assignment lookups, max 4,000 projected entries (overflow fails 503, never silently truncates). No new cron, recurring writes, browser polling, process cache, CDN cache or new package.
- ETag supports conditional HTTP requests, but token/access checks always run before 304. Every response is private/no-store; no public caching of revoked feeds. Failures return 503 + retry hint, not an empty feed. Invalid/revoked credentials receive the same 404. No app logs, redirects, analytics events or errors contain keys or feed contents. The bearer URL is necessarily sent to Outlook and may exist in infrastructure/provider request logs; restrict access to those logs and rotate if disclosed.

## Release and verification

Additive migration; no existing calendar, job/task, notification or ClickUp records are changed. Tests cover ICS round trips, time windows, all-day dates, UTF-8 folding, injection, ownership, same-origin mutations, metadata-only reads, random/hash-only token storage, conditional requests, revocation and UI confirmations. Rollback-only database checks exercise grants, RLS, MFA, projection and rotation/revocation without saving test subscriptions.

Rollback: deploy previous app version and leave the unused protected table in place. Revoke issued subscriptions before a deliberate teardown; do not drop unrelated tables or alter native work records.

References: [Microsoft subscriptions](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web), [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html).
