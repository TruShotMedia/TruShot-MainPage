# Private Outlook calendar subscription (AutoPacific)

## User flow

Sign in to AutoPacific using the account whose calendar should display the events. Open Calendar → Outlook calendar (calendar-sync icon on mobile). Enter a label and the published **ICS subscription URL**, then connect. Do not use the HTML sharing URL or a downloaded file.

The feed is private to that login. It is not exposed to Marketing, the team view, the main TruShot CRM calendar or the TruShot `/tablet` workspace. AutoPacific My Space, Today and its authenticated kiosk can display the owner's imported events. Outlook events remain read-only even in edit mode. They do not generate ClickUp tasks or CRM push reminders.

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
