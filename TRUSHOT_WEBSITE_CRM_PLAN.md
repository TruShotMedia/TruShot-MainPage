# TruShot Media Website + CRM Product Plan

Status: implementation-ready product blueprint
Prepared: 19 August 2026
Primary stack: GitHub + Next.js on Vercel + Supabase

## 1. Executive recommendation

Build one responsive Next.js application in one repository and one Vercel project:

- `/` is the customer-facing TruShot Media website.
- `/admin` is the private CRM. An unauthenticated visit redirects to `/admin/login`; authenticated users enter the CRM.
- Supabase provides authentication, PostgreSQL, Realtime notifications, and small-file storage.
- The first owner account is the existing Supabase Auth user for `info@fearlessau.com`. There is no public admin signup.
- Every TruShot-owned Supabase object uses the exact `website-` prefix. Because hyphens require quoted PostgreSQL identifiers, migrations and queries must consistently use names such as `"website-clients"`.
- The public site is deliberately short, visual, fast, SEO-ready, and conversion-focused. Pricing is published from the CRM so the website never has a second hard-coded copy.
- The CRM is designed around the actual operating chain: enquiry -> approved client -> job -> tasks/assets -> invoice allocations -> payments -> finance and tax estimates.

The product should feel editorial and cinematic on the public side, and calm, dense, and operational on the admin side. The same brand tokens should connect them without making the CRM visually theatrical.

## 2. Current-state audit

### Connected projects

- GitHub: [`TruShotMedia/TruShot-MainPage`](https://github.com/TruShotMedia/TruShot-MainPage) exists, is public, and is currently empty.
- The local Git repository is also empty and does not yet have a remote configured.
- Vercel project `tru-shot-main-page` exists under `info-30967208s-projects`, but has no framework selection, production deployment, or domain yet. It is currently configured for Node.js 24.x.
- Supabase project `pothvkhxqbuyehzmkcdh` is the active `Optra Studio` project on PostgreSQL 17 in `ap-northeast-1` (Tokyo).
- Supabase is shared with other applications and already contains unrelated `clients`, `jobs`, `tasks`, `ledger_*`, `noa_*`, and `life_*` tables. The TruShot build must not reuse or modify them.

### Source-data audit

The attached exports contain:

| Source | Rows | Important observations |
|---|---:|---|
| Clients | 11 | Retainer, priority, budget, industry, jobs, content types, and active status are present but sparsely populated. |
| Jobs | 22 | 21 distinct job names; 6 jobs have no client; 7 have no invoice reference; 1 has no status. |
| Tasks/assets | 87 | 86 named rows; 5 have no linked job; 63 have no due date; 4 have no shoot date; the export contains no task-hours column. |
| Invoices | 3 | Invoice values total AUD $2,115. |

The invoice exports confirm a many-to-many accounting relationship: one invoice can cover several jobs. In the legacy export, `Value` repeats the related invoice's full value, while `$AUD Value` is the intended per-job allocation. In the new CRM, the visible Job Value replaces this ambiguous legacy distinction and is calculated from task hours: related invoice value divided by the total task hours of every job linked to that invoice, multiplied by the current job's task hours. The database must therefore use explicit invoice-to-job allocations and must never sum repeated invoice rollups.

The supplied data validates this formula exactly for all three linked invoices: AUD $1,000 across 10 hours (AUD $100/hour), AUD $665 across 23.75 hours (AUD $28/hour), and AUD $450 across 14.5 hours (approximately AUD $31.0345/hour). In every group, the calculated job allocations match the exported `$AUD Value` rows and reconcile to the invoice total.

Legacy task statuses found in the CSV are `Notes/Client Info` and `Posted / Done`. The supplied desired pipeline defines the new canonical task/asset statuses.

### Brand audit

- Primary green sampled from the supplied assets: `#1F5E41`.
- Supporting core colours: near-black, white, and restrained neutral greys.
- Black logo: light backgrounds.
- Green logo: white or warm-white backgrounds.
- White logo: green or near-black backgrounds.
- The supplied white logo is visually white-on-white in its source canvas; ideally obtain the original vector/transparent export before launch.
- The wallpaper should inform a hero or full-bleed brand moment, not become a repeated background texture.

## 3. Product principles

1. One source of truth. Pricing, clients, jobs, tasks, invoices, and finance calculations live in Supabase and are edited only through the CRM.
2. Fast path first. The most common actions must take one or two interactions: add a job, update a task status, record a payment, approve an enquiry.
3. Progressive detail. Lists remain clean; secondary information appears in drawers, detail pages, or expandable panels.
4. Mobile is operational, not merely responsive. Every CRM action must work without hover, precision dragging, or wide tables.
5. Motion communicates state. Animations explain transitions and successful actions; they never delay work.
6. Privacy by design. Track only the behaviour needed to improve conversion. Never record form field content, keystrokes, or sensitive identifiers in analytics.
7. Finance is explainable. Every total links back to source invoices, payments, expenses, and documented assumptions.
8. Tax is an estimate. The CRM assists cash-flow planning; it does not lodge returns or replace an accountant or registered tax/BAS agent.

## 4. Recommended technical architecture

### Application

- Current stable Next.js App Router at implementation time, TypeScript, React Server Components, and Node.js runtime by default.
- Route groups separate `(marketing)`, `(auth)`, and `(admin)` layouts without creating a second application.
- Server Components perform authenticated reads directly from Supabase.
- Server Actions handle internal CRM mutations.
- Route Handlers handle public enquiry intake, analytics ingestion, external webhooks, and health checks.
- `proxy.ts` protects `/admin/:path*`, refreshes Supabase sessions, and redirects unauthenticated users.
- Zod validates all server-bound input.
- Tailwind CSS plus an accessible component system such as shadcn/ui provides the UI foundation.
- `dnd-kit` provides accessible pipeline drag-and-drop; every drag action also has a menu/keyboard alternative.
- Apache ECharts, dynamically loaded only in the admin area, supports rich finance charts and click heatmaps without affecting the public landing-page bundle.
- Motion is limited to opacity/transform transitions, approximately 120–240 ms, and respects `prefers-reduced-motion`.

### Deployment

- One GitHub repository, one Vercel project, automatic preview deployments for pull requests, and protected production deploys from `main`.
- Static marketing content and optimized images serve from Vercel's CDN.
- Data-bound server functions should be placed close to the existing Tokyo Supabase region; public static assets remain globally cached.
- Environment variables are separated across Development, Preview, and Production. Only the Supabase URL and publishable key may reach the browser. The Supabase secret/service-role key stays server-only.
- Add a production domain, canonical redirect, spend alerts, Vercel Web Analytics, Speed Insights, and error monitoring before launch.

### Repository shape

```text
src/
  app/
    (marketing)/
      page.tsx
      privacy/page.tsx
      terms/page.tsx
    (auth)/admin/login/page.tsx
    (admin)/admin/
      page.tsx
      requests/page.tsx
      pipeline/page.tsx
      clients/page.tsx
      jobs/page.tsx
      tasks/page.tsx
      invoices/page.tsx
      finance/page.tsx
      pricing/page.tsx
      analytics/page.tsx
      settings/page.tsx
    api/
      enquiry/route.ts
      analytics/events/route.ts
      health/route.ts
  components/
    marketing/
    admin/
    charts/
    ui/
  lib/
    auth/
    database/
    finance/
    tax/
    analytics/
    validation/
supabase/
  migrations/
  seed.sql
tests/
  unit/
  integration/
  e2e/
```

## 5. Customer-facing website

### Primary journey

The website is a one-page sales experience at `/`, with legal/supporting pages outside the main flow. The primary journey is:

`Landing -> understand the offer -> see work/proof -> compare pricing -> select a package -> submit enquiry`

### Page structure

1. Header
   - Logo, `Work`, `Services`, `Pricing`, `About`, and `Enquire`.
   - Transparent over the opening visual, then a compact solid state after scrolling.
   - Mobile menu uses a full-height sheet and a persistent `Enquire` action.

2. Hero
   - Strong outcome-led headline, one short supporting sentence, and two actions: `View Packages` and `Enquire`.
   - Preferred visual: a short, muted, poster-backed showreel with a static/mobile fallback. No autoplay audio.
   - The green wallpaper or white logo on green provides the loading/poster state.

3. Selected work
   - Three to six curated projects with still, short loop, client category, and service tags.
   - Avoid a large archive at launch; quality and speed matter more than quantity.
   - Add `VideoObject` structured data when real hosted video is supplied.

4. What TruShot does
   - Videography, photography, social content, and growth support expressed as customer outcomes rather than a generic service list.

5. Simple process
   - Discover -> Shoot -> Refine -> Deliver/Grow.
   - Sets expectations about access, revision rounds, delivery, and ongoing packages.

6. Pricing
   - Five cards read from the published pricing version in Supabase.
   - Desktop comparison is scannable; mobile uses stacked cards with inclusions collapsed after the first key items.
   - `Content Growth` is marked `Most Popular`.
   - `Content + Growth` receives the premium treatment and clearly states that Meta ad spend is separate.

7. About
   - Short founder/business story, portrait or behind-the-scenes image, service area, and working style.
   - Keep this human and specific; avoid a long corporate biography.

8. FAQ
   - Coverage area, turnaround, revisions, raw footage, usage rights, monthly sessions, extra locations, and custom work.

9. Enquiry
   - A package CTA opens or scrolls to a short form with the selected package prefilled.
   - Required: name, business name, email, goal/brief, privacy acknowledgement.
   - Optional: phone and preferred timeframe.
   - Separate, unchecked consent is required if future marketing emails are offered.

10. Footer
   - Contact details, service area, social links, privacy, terms, copyright, and ABN/legal name once confirmed.

### Pricing imported from the supplied guide

| Package | Price | Positioning | Primary CTA |
|---|---:|---|---|
| Social Reel | AUD $350 one-off | Professional content when needed | Book a Shoot |
| Content Essentials | AUD $1,000/month | Two videos + 15+ photos | Enquire About This Package |
| Content Growth | AUD $1,750/month | Three videos + 25+ photos + digital assets + guide | Enquire About This Package |
| Content Partner | AUD $2,500/month | Six videos + 40+ photos + Facebook/Instagram scheduling | Enquire About This Package |
| Content + Growth | AUD $3,500/month + ad spend | Content, organic social, and one focused Meta campaign | Start Growing |

All inclusions, exclusions, notes, CTA text, ordering, visibility, billing interval, and badges are CRM-configurable. A draft/publish workflow prevents partially edited prices from appearing publicly. Existing jobs and invoices retain a snapshot of the package and price used at creation.

## 6. CRM information architecture

### Navigation

Desktop uses a collapsible left rail and top command/search bar:

- Overview
- Requests
- Pipeline
- Clients
- Jobs
- Tasks / Assets
- Invoices
- Finance
- Pricing
- Analytics
- Settings

Notifications live in the header with unread count and a full notification drawer. On mobile, the bottom navigation contains `Home`, `Pipeline`, `Jobs`, `Finance`, and `More`; lists become cards or focused detail views rather than squeezed desktop tables.

### Overview

- KPI strip: new enquiries, active jobs, tasks needing attention, overdue invoices, cash received this month, current tax reserve gap.
- `Today` panel: shoot dates, due tasks, follow-ups, and overdue items.
- Revenue chart: paid vs outstanding by month.
- Workload chart: tasks/assets by status and due date.
- Quick actions: new client, new job, record invoice, add expense.
- All cards link to the filtered source list.

### Requests

- Inbox statuses: `New`, `Reviewing`, `Approved`, `Declined`, `Spam`, `Archived`.
- Request detail includes selected package, attribution source, contact details, message, timestamps, and internal notes.
- `Approve` runs one idempotent transaction that creates the client, links the request, marks it approved, and optionally opens a draft job.
- `Decline` records an internal reason without deleting the request.
- New requests create a CRM notification in real time; optional email notification can be added later.

### Clients

- Searchable list with active/archived, priority, retainer, industry, content types, lifetime invoiced, outstanding amount, and last activity.
- Client detail: overview, contacts, jobs, invoices/payments, activity timeline, links/files, notes, and analytics attribution where consent and policy allow.
- Duplicate detection uses normalized email, phone, and business name; merging is an explicit audited operation.

### Jobs

- List views: table, cards, calendar, and job pipeline.
- Editable job fields: client, title, package snapshot, lifecycle status, priority, shoot/due dates, location, photo count, budget, internal cost, assigned users, file links, and notes.
- Derived job fields: total hours, created assets, open tasks, and Job Value. These are read-only rollups and are never manually maintained.
- Job detail contains overview, tasks/assets, invoice allocations, profitability, activity, and files.
- Job lifecycle defaults: `Enquiry`, `Quoted`, `Booked`, `Scheduled`, `In Production`, `Editing`, `Awaiting Client`, `Complete`, `Archived`. These are configurable independently of task status.

#### Derived job metrics

- `Hours` = the sum of `hours` across every task related to the job.
- `Created Assets` = the total number of task records related to the job.
- `#Photos` = the number of finished photos supplied to the client for that job. This remains an explicit job field because photos are not necessarily represented by individual task records.
- `Open Tasks` = tasks whose status is neither `Ready To Post` nor `Posted / Done`. `Final Draft/Notes` and every earlier status still count as open.
- `Job Value` = the sum of the job's calculated allocations from its related invoice or invoices.

For each invoice:

```text
invoice hourly rate = invoice value / sum of Hours for all jobs linked to the invoice
job allocation      = invoice hourly rate * current job Hours
Job Value           = sum of the current job's allocations across all related invoices
```

Example: if a AUD $1,000 invoice covers jobs with 2, 3, and 5 hours, the invoice has 10 total hours and an hourly rate of AUD $100. The three job allocations are AUD $200, $300, and $500.

Task creation/deletion and task-hour edits must recalculate the affected job rollups and all job allocations on the related invoice in one transaction. Allocations are stored in integer cents. Any rounding remainder is assigned deterministically using the largest-remainder method so allocations always add back to the exact invoice value. An invoice whose related jobs total zero hours remains `Unallocated` and is excluded from job-value/profitability reporting until hours are entered or an authorised manual allocation is supplied. Recalculations and overrides are audited; allocations are locked when the invoice/accounting period is closed.

### Tasks / Assets

Tasks represent the work and created content assets inside a job. Each task records its own hours; the job's `Hours` and `Created Assets` are calculated from these task rows. Photo delivery volume remains the separate job-level `#Photos` field, so a 40-photo gallery does not require 40 artificial task records.

Default pipeline statuses, in the supplied order and visual intent:

| Order | Status | Default colour intent |
|---:|---|---|
| 1 | Not Started | neutral grey |
| 2 | In Progress | blue |
| 3 | Ready For Revision | burnt orange |
| 4 | Final Draft/Notes | purple |
| 5 | Ready To Post | green |
| 6 | Posted / Done | dark neutral |

- Pipeline can switch between Jobs and Tasks/Assets.
- Cards show title, client/job, type, asset counts, assignee, due date, priority, and flags.
- Dragging performs an optimistic UI update followed by a transactional status/rank update and audit entry.
- Keyboard users use move controls; mobile users use a status action sheet or full-screen lane view.
- Filters: client, job, assignee, due range, priority, asset type, and status.
- Saved views: `My Work`, `Due This Week`, `Needs Revision`, `Ready to Post`, and `Overdue`.

### Invoices

- Track invoice number, client, issue/due dates, status, GST treatment, subtotal, GST, total, amount paid, balance, external/PDF link, notes, and related jobs.
- Statuses: `Draft`, `Sent`, `Part Paid`, `Paid`, `Overdue`, `Void`, `Written Off`.
- One invoice can allocate amounts to many jobs; one job can receive allocations from more than one invoice. Each allocation is calculated from the linked jobs' rolled-up task hours using the formula above.
- Payments are separate records so partial payments and payment dates remain accurate.
- MVP tracks invoices rather than replacing accounting software. PDF generation, email sending, Xero, MYOB, or Stripe integrations are optional later phases.

### Pricing

- Package list, drag ordering, active/hidden, one-off/monthly/custom billing, AUD price, GST display, tagline, description, inclusions, exclusions, notes, CTA, badge, and visual emphasis.
- Draft, preview, publish, and rollback to an earlier version.
- Package task templates can generate standard tasks/assets when a job is created.
- Price changes never rewrite past job or invoice snapshots.

### Settings

- Business details, domain/service area, timezone `Australia/Brisbane`, currency `AUD`, GST status, financial-year/tax settings, notification preferences, pipeline configuration, users/roles, retention controls, and data export.
- Audit log and import report are read-only.

## 7. Finance and sole-trader tax planning

### Finance page

The finance area should answer three questions immediately: what has been earned, what is still owed, and how much cash should be reserved.

Key metrics:

- cash received, invoiced revenue, outstanding receivables, overdue receivables
- expenses paid, net cash flow, accounting profit, and job gross margin
- average job value, revenue per client, package mix, and client concentration
- billable/production hours, revenue per hour, and internal/contractor costs
- GST collected, GST credits, estimated BAS liability, PAYG paid, estimated income tax, and tax reserve gap

Recommended visualisations:

- paid/outstanding revenue stacked by month
- revenue, expenses, and profit combination chart
- 30/60/90+ day receivables ageing
- job profitability scatterplot: hours vs margin
- revenue by client and package, with concentration warning
- cash-flow forecast from invoice due dates and recurring packages
- GST/BAS input-output waterfall
- income-tax estimate waterfall from business profit to estimated balance

### Expense support required

The current exports do not contain expenses, so accurate profit and tax estimates require a new expense ledger with date, supplier, category, amount, GST, GST-credit eligibility, payment account, receipt link, job/client allocation, tax deductibility, and notes. Bank CSV import can be a later enhancement; manual entry and CSV import are sufficient for the first release.

### Estimation engine

The engine is versioned by Australian financial year and records every assumption used in each saved estimate. For 2026–27, the initial resident tax schedule should be seeded only after launch review against current ATO/Treasury guidance: tax-free to $18,200; then 15%, 30%, 37%, and 45% bands at the current statutory thresholds. It should also model, when configured:

- total individual taxable income, not business income in isolation
- net small-business income and the small-business income-tax offset
- Medicare levy, including threshold/reduction/exemption inputs
- GST collected less eligible GST credits if registered
- PAYG instalments already paid
- other taxable income, personal deductions, carried losses, and optional HELP/other adjustments
- cash or accrual reporting assumptions and GST-inclusive/exclusive source values

The UI must show `Estimate only`, the financial year, calculation date, included/excluded items, confidence warnings, and a link to edit assumptions. Do not show one unexplained `tax owed` number.

Current official guidance supports the following planning rules:

- A sole trader reports business income and expenses in the individual return and pays tax at individual rates.
- The 2026–27 first resident rate is legislated at 15% for taxable income from $18,201 to $45,000; higher rates remain 30%, 37%, and 45% at their statutory thresholds.
- The Medicare levy is generally 2% but reductions and exemptions can apply.
- GST registration is generally required when current or projected GST turnover reaches AUD $75,000; once registered, BAS obligations apply.
- The small-business income-tax offset is currently 16% of the qualifying tax amount, capped at AUD $1,000, for eligible businesses below the turnover threshold.
- PAYG instalments are prepayments, not an additional tax, and should be subtracted from the estimated year-end liability.

The calculation module needs boundary tests for every threshold and an annual accountant/ATO review before a new rate table can be marked `active`.

## 8. Analytics and click tracking

### Two-layer model

1. Vercel Web Analytics and Speed Insights provide privacy-oriented aggregate traffic and Core Web Vitals.
2. A first-party TruShot event collector writes the CRM-specific funnel, click targets, active dwell time, and enquiry attribution to Supabase.

This avoids depending on Vercel custom events, which can be plan-dependent, while still allowing the public Vercel Web Analytics API to populate aggregate CRM cards when available.

### Event taxonomy

- `page_view`
- `section_view`
- `cta_click`
- `portfolio_play`
- `package_expand`
- `package_select`
- `form_start`
- `form_error`
- `form_submit`
- `outbound_click`
- `active_time`
- `web_vital`

Every interactive element receives a stable analytics key such as `pricing.content-growth.primary-cta`. Store the key, page, section, package ID, timestamp, anonymous session ID, referrer domain, UTM values, device class, viewport bucket, and optional normalized click coordinates. Never store clicked text from user-generated content, form values, full IP addresses, or raw user agents.

### Dwell time

- Count only when the page is visible and the browser window is active.
- Send a lightweight heartbeat approximately every 15 seconds and a final `sendBeacon` on `pagehide`.
- Cap obviously abandoned sessions and aggregate active time into session and daily summary records.
- Clearly label the metric `active time`, not an exact measure of attention.

### Click map

- Primary report: clicks by named element and page section, because it survives responsive layout changes.
- Secondary visual: normalized x/y heatmap split by desktop, tablet, and mobile.
- Store a layout/version identifier so old coordinates are not overlaid onto a new design.

### CRM analytics pages

- Overview: visitors, sessions, page views, active time, bounce/engagement, enquiries, and conversion rate.
- Acquisition: referrer, UTM source/medium/campaign, landing page, and device.
- Content: section reach, portfolio plays, FAQ engagement, and top outbound clicks.
- Pricing: package impressions, expansions, selections, form starts, submissions, and approval/won-job conversion.
- Funnel: visitor -> pricing view -> package selected -> form started -> enquiry submitted -> approved client -> won job.
- Performance: LCP, INP, CLS, and errors by device/page.

### Privacy controls

- Publish an accessible privacy policy and a collection notice beside the enquiry form.
- Use a privacy settings control for analytics preferences even if the chosen aggregate tooling is cookie-less.
- Make the analytics schema data-minimising and configure raw-event retention (recommended: 90 days), while retaining non-identifying daily aggregates longer.
- Keep `/admin` excluded from public analytics and redact private/dynamic paths before sending anything to Vercel.
- The Supabase project is in Japan. Confirm vendor processing and disclose likely overseas recipients/countries where required. If Australian data residency becomes mandatory, that requires a separate architecture decision because the nominated project is already in Tokyo.

## 9. Supabase data model

### Naming rule

All application-owned tables, views, custom types, functions, triggers, storage buckets, cron jobs, and Realtime channels use the exact `website-` prefix. Built-in PostgreSQL primitives (`uuid`, `text`, `timestamptz`, `jsonb`, and similar) and Supabase-managed schemas cannot and should not be renamed.

Hyphenated names must always be quoted in SQL. Supabase JavaScript calls use strings, for example `.from('website-clients')`. Generated TypeScript types will expose quoted string keys; a typed repository layer should hide this inconvenience from UI code.

### Core objects

| Object | Purpose / key relationships |
|---|---|
| `website-workspaces` | One TruShot workspace now; allows controlled future staff access. |
| `website-admin-users` | Supabase Auth user membership, role, active state; initial owner is `info@fearlessau.com`. |
| `website-enquiries` | Public requests, selected package/version, attribution, consent, review state, converted client. |
| `website-notifications` | In-app notification feed, read state, type, and linked entity. |
| `website-clients` | Business/client master record, status, priority, retainer, budget, industry, and content types. |
| `website-client-contacts` | Multiple people/emails/phones per client with a primary contact. |
| `website-jobs` | Client, package snapshot, lifecycle, dates, location, photo count, costs, and notes; hours/assets/open tasks/value are derived. Includes a nullable, import-only legacy-hours snapshot for the CSV transition. |
| `website-job-statuses` | Configurable job pipeline label, colour, order, active state. |
| `website-job-tasks` | Job work item/created asset, hours, assignee, due dates, type, priority, status, and rank. |
| `website-task-statuses` | Configurable supplied task pipeline labels, colours, and order. |
| `website-task-comments` | Timestamped internal notes and revision history. |
| `website-pricing-versions` | Draft/published package-set version and publish metadata. |
| `website-pricing-packages` | Title, slug, pricing, interval, copy, CTA, badge, order, and active state. |
| `website-pricing-package-items` | Inclusion, exclusion, typical-use, note, quantity/unit, group, and order. |
| `website-package-task-templates` | Standard tasks/assets generated when a package becomes a job. |
| `website-invoices` | Header totals, GST, dates, client, status, balance, and source link. |
| `website-invoice-lines` | Description, quantity, unit rate, GST treatment, and total. |
| `website-invoice-job-allocations` | Many-to-many invoice/job allocation calculated from job task hours; stores rate, hours snapshot, cents, rounding adjustment, lock state, and override audit data. |
| `website-payments` | Partial/full receipts against invoices. |
| `website-expenses` | Business expenses, GST credits, deductibility, receipt, and optional job allocation. |
| `website-expense-categories` | Reporting and tax categories. |
| `website-tax-rate-sets` | Versioned financial-year brackets, levy rules, and activation/review state. |
| `website-tax-settings` | GST/PAYG/tax basis and owner-specific estimate assumptions. |
| `website-tax-estimate-snapshots` | Immutable saved calculation, assumptions, warnings, and results. |
| `website-analytics-sessions` | Pseudonymous, short-retention website session summaries. |
| `website-analytics-events` | Data-minimised first-party events with retention controls. |
| `website-analytics-daily` | Long-lived non-identifying daily aggregates. |
| `website-activity-log` | User-visible entity timeline. |
| `website-audit-log` | Append-only before/after security and financial audit events. |
| `website-import-runs` | Source file checksums, row counts, errors, reconciliation, and operator. |
| `website-settings` | Business, SEO, notification, retention, and feature configuration. |

Storage buckets:

- `website-brand-assets`: logo derivatives, OG assets, and lightweight public media.
- `website-job-documents`: private briefs, approvals, thumbnails, and small supporting files.
- `website-invoice-files`: private invoice/receipt documents.

Large raw video should remain in a specialist media/file platform and be linked from the CRM rather than uploaded to Supabase Storage.

### Data conventions

- UUID primary keys; all money stored as integer AUD cents.
- `timestamptz` in UTC; display in `Australia/Brisbane`.
- `created_at`, `updated_at`, `created_by`, `updated_by`, and `archived_at` on mutable business records.
- Foreign keys and indexes on every join/filter key.
- Check constraints for non-negative money/counts and valid date relationships.
- Soft archive for business records; hard delete only for approved privacy/retention workflows.
- Published pricing and tax snapshots are immutable.

### Access model

- RLS enabled on every new exposed table.
- `anon` can read only the currently published pricing projection. Public enquiry and analytics writes go through validated server endpoints rather than direct table grants.
- `authenticated` access requires active membership of the TruShot workspace; policies check both `auth.uid()` and `workspace_id`.
- Finance/tax/settings writes require `owner` or `admin`; a future `editor` can manage clients/jobs/tasks but not tax settings or users.
- Do not authorize from user-editable `user_metadata`; use database membership and, only if needed, controlled `app_metadata`.
- Views use `security_invoker = true` and inherit underlying RLS.
- Supabase secret/service-role credentials are restricted to server code and never exposed as `NEXT_PUBLIC_*` variables.
- Private storage uses authenticated RLS and short-lived signed URLs.

## 10. Enquiry-to-client workflow

1. Visitor selects a package; the form carries package/version and attribution IDs.
2. Server validates fields, consent, origin, rate limit, honeypot, and bot challenge.
3. Server writes `website-enquiries`; no public browser has direct insert access.
4. Database creates a `website-notifications` row; Supabase Realtime updates the CRM header.
5. Owner reviews and adds notes.
6. `Approve` transaction:
   - checks the request has not already been converted
   - matches or creates a client
   - copies the approved contact details
   - links the enquiry to the client
   - marks the request approved
   - optionally creates a draft job using the selected package snapshot
   - creates an audit entry
7. Any retry returns the existing result rather than duplicating the client.

## 11. CSV migration plan

### Import order

1. Create a timestamped encrypted backup and an import run record.
2. Parse and normalize clients.
3. Parse invoices.
4. Parse jobs, resolve client/invoice references, and retain the exported job `Hours` as a labelled legacy-hours snapshot.
5. Parse tasks/assets and resolve jobs. Their hours begin unset because the task CSV has no task-hours column.
6. Recalculate the historical invoice/job allocations from the legacy job-hours snapshots and compare them with legacy `$AUD Value`.
7. Reconcile totals and produce an unresolved-row/task-hours backfill report.
8. Obtain owner sign-off before the imported data becomes the production default view.

### Mapping rules

- `Notes/Client Info` -> `Final Draft/Notes`.
- `Posted / Done` remains `Posted / Done`.
- `Paid = Yes/No` maps to invoice/payment state only when corroborated by the linked invoice; it is not trusted as an invoice total.
- Legacy job `Value` is treated as the related invoice's repeated total and is retained only in the restricted import audit; it is not a CRM business metric.
- Legacy job `$AUD Value` is used as a reconciliation check for the new hour-weighted allocation, not as an editable field.
- Task count immediately rolls up into `Created Assets`.
- The task CSV has no task-hours property, so the importer must not invent or evenly distribute hours. Existing job `Hours` is retained as an explicitly labelled legacy snapshot to preserve historical allocations until task hours are backfilled.
- For new jobs, and for imported jobs after backfill, `Hours` is exclusively the sum of task hours. Once an imported job's task hours reconcile to its legacy snapshot, the legacy calculation fallback is retired for that job.
- Imported `#photos` becomes the explicit job photo count.
- `Open Tasks` is recalculated from task status and excludes only `Ready To Post` and `Posted / Done`.
- The CRM's visible `Job Value` is the sum of calculated invoice/job allocations, not the legacy `Value` column.
- Existing relation strings are parsed to their visible title/reference; original row number and source reference remain in the import audit.
- Duplicate job names are disambiguated by source row/reference, never merged on title alone.
- The one unnamed task, five tasks without a job, six jobs without a client, seven jobs without an invoice, and one job without status are quarantined for review rather than dropped.

### Reconciliation gates

- 11 client rows accounted for.
- 22 job rows accounted for, including the duplicate name.
- 87 task rows accounted for, with 86 immediately usable and 1 flagged for naming.
- 3 invoices created.
- Invoice totals and job allocations reconcile to AUD $2,115.
- The three invoice groups reproduce the exported allocations exactly from their legacy job Hours before task-level backfill.
- Each unresolved relation appears in a visible import report.
- Re-running the import is idempotent and creates no duplicates.

## 12. SEO, accessibility, and performance

### SEO

- One clear H1 and semantic section structure.
- Unique title/description, canonical URL, Open Graph image, favicon, sitemap, and robots rules.
- `/admin` and authenticated/API routes are `noindex` and excluded from sitemaps/analytics.
- Structured data: `LocalBusiness` or `ProfessionalService`, `Offer`, `FAQPage`, `BreadcrumbList`, and `VideoObject` where evidence exists.
- Copy targets actual service + service-area searches once the Queensland service area is confirmed.
- Connect Google Search Console and Bing Webmaster Tools at launch.
- Preserve readable package copy in HTML; do not hide essential pricing in images or client-only rendering.

### Accessibility

- WCAG 2.2 AA target.
- Keyboard-accessible menus, dialogs, tables, charts, and pipeline movement.
- Visible focus, correct labels/errors, logical headings, 44 px touch targets, accessible contrast, and reduced motion.
- Charts include summaries/tooltips and a table fallback for the same data.
- Video has captions/transcript where spoken content carries meaning.

### Performance targets

- Mobile Lighthouse: Performance >= 90; Accessibility, Best Practices, and SEO >= 95 on core public pages.
- 75th-percentile Core Web Vitals: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1.
- Responsive `next/image`, poster images, compressed WebM/MP4, lazy loading below the fold, self-hosted fonts, and no marketing scripts in the critical path.
- Admin charts and drag/drop code are route-scoped and dynamically loaded.

## 13. Security, reliability, and compliance

- Invite-only Supabase Auth; initial owner `info@fearlessau.com`.
- Email/password or passwordless login with recovery; require MFA before launch for owner/admin accounts.
- Server-side session validation on every admin route and mutation; hiding the route is never treated as security.
- Rate limiting, bot protection, honeypot, input-size limits, and generic success responses on public forms.
- Content Security Policy, HSTS, frame protection, secure/referrer/permissions headers, and dependency lockfile.
- RLS integration tests for anonymous, correct user, wrong user, inactive member, and service role.
- Append-only audit records for status moves, approvals, client merges, invoice/payment/expense changes, price publishing, tax settings, imports, and user access.
- Automated database backup capability and a documented/tested restore procedure appropriate to the Supabase plan.
- Error monitoring and structured logs must redact contact, invoice, and authentication data.
- Data export, correction, retention, and deletion procedures documented before launch.
- Privacy policy and point-of-collection notice describe enquiry fields, analytics, storage/processing providers, retention, access/correction, complaints, and likely overseas disclosure.

## 14. Delivery phases

### Phase 0 — Decisions and content readiness (2–4 days)

Deliverables:

- confirm domain, service area, business/legal details, GST display, and invoice scope
- obtain portfolio/showreel, testimonials, about copy, contact/social links, and transparent/vector logo if available
- approve sitemap, wireframes, roles, and data model
- confirm Tokyo data residency is acceptable for this nominated Supabase project

Gate: no unknown decision can change the database model or primary customer journey.

### Phase 1 — Repository and platform foundation (3–5 days)

- scaffold Next.js/TypeScript, code quality, tests, and design tokens
- connect local repository, GitHub, and Vercel previews
- configure environments, deployment protections, headers, error pages, health check, Analytics, and Speed Insights
- add branded admin/public shells and responsive navigation

Gate: pull request previews build cleanly; no secret appears in source or browser bundles.

### Phase 2 — Supabase schema, auth, and migration tooling (5–8 days)

- create prefixed schema objects through migrations
- implement invite-only auth, `/admin` protection, workspace roles, RLS, storage policies, audit log, and generated types
- build dry-run/idempotent CSV importer and reconciliation report

Gate: RLS tests pass; dry-run accounts for every source row and AUD $2,115 of invoice allocations.

### Phase 3 — CRM core (7–10 days)

- Overview, Requests, Clients, Jobs, Tasks/Assets, global search, filters, detail views, responsive states, and notifications
- enquiry approval transaction and activity timeline
- import and owner review of existing data

Gate: owner can move from request to client to job/task on phone, tablet, and desktop.

### Phase 4 — Pipeline and pricing management (5–7 days)

- accessible job/task pipelines, drag ordering, mobile status controls, saved filters
- pricing draft/preview/publish, package items, task templates, snapshots, and rollback

Gate: reordering/status changes survive refresh and concurrency; pricing edits do not alter historical jobs.

### Phase 5 — Public website and enquiry conversion (7–10 days)

- complete landing page, portfolio, process, live pricing, about, FAQ, enquiry, legal pages, SEO metadata, structured data, and responsive media
- bot protection and notifications

Gate: successful enquiry appears once in the CRM with correct package and attribution; public page meets performance/accessibility targets.

### Phase 6 — Invoices, expenses, finance, and tax estimator (8–12 days)

- invoices, allocations, payments, expenses, finance dashboard, reporting filters, exports, versioned tax rules, assumption editor, and estimate snapshots

Gate: source totals reconcile; partial payments and multi-job invoices work; bracket/GST/PAYG tests pass at boundaries.

### Phase 7 — CRM analytics and click heatmaps (5–8 days)

- event collector, active-time tracking, attribution, retention aggregation, funnels, pricing analytics, click map, and performance dashboard

Gate: no PII appears in event payloads; a test session completes the full website-to-approved-client funnel.

### Phase 8 — Launch hardening (5–7 days)

- full responsive/E2E/security/accessibility testing
- backup/restore exercise, observability, runbook, admin guide, privacy review, production domain, redirects, and post-launch monitoring

Gate: launch checklist and rollback plan signed off; production smoke test passes.

Indicative total for one experienced full-time developer is roughly 8–12 weeks once content and business decisions are ready. Design/content preparation, testing, and implementation can overlap, but security, migration reconciliation, and finance validation should not be compressed.

## 15. Acceptance test matrix

Critical end-to-end tests:

1. Unauthenticated `/admin` visit redirects to login and leaks no CRM data.
2. `info@fearlessau.com` signs in, restores a session, signs out, resets access, and completes MFA.
3. Public package selection prefills the correct published version.
4. Spam/invalid enquiries are rejected; a valid request creates exactly one notification.
5. Approving the same request twice produces one client.
6. Client -> job -> package tasks -> pipeline -> completion works at 360 px, 768 px, 1024 px, and desktop widths.
7. Pipeline is operable by keyboard and without drag-and-drop.
8. An invoice can allocate to several jobs; totals never double count.
9. Adding or editing a task updates its job's Hours, Created Assets, Open Tasks, and affected invoice allocations atomically.
10. Hour-weighted job allocations reconcile exactly to invoice cents, including rounding and zero-hour cases.
11. Partial payments update invoice balance/status and finance cash metrics correctly.
12. Expenses and GST credits flow into BAS estimates with explicit assumptions.
13. Tax bracket, offset, Medicare, GST, and PAYG boundary cases match approved fixtures.
14. Pricing draft is invisible publicly until publish; rollback restores a complete previous set.
15. Analytics exclude `/admin`, never contain form data/PII, and report active—not background—time.
16. Import rerun is idempotent, invents no task hours, reproduces the three historical invoice allocations from legacy job Hours, and still balances.
17. Backfilling task hours retires the legacy-hours fallback only when the task sum reconciles or an authorised variance is approved.
18. Backup restore and rollback procedures are successfully rehearsed.

## 16. Decisions needed before implementation, not before planning

- Production domain and canonical `www` preference.
- Exact Queensland service area and public phone/address/ABN/legal name.
- Whether public prices include GST and the effective GST registration date.
- Cash or accrual accounting basis and BAS cadence.
- Whether the CRM only tracks invoices or must generate/send them.
- Other taxable income, PAYG, HELP, Medicare, and deduction inputs to include in the private estimator.
- Preferred admin login method and whether any staff/collaborators require access.
- Portfolio/showreel files, client permissions, testimonials, and behind-the-scenes/about imagery.
- Data retention period and confirmation of overseas processing disclosure for the Tokyo Supabase project and Vercel.
- Whether large job files remain links (recommended) or require an external storage integration.

## 17. Definition of done

The product is complete when:

- the live root URL presents a fast, branded, SEO-ready landing page with CRM-managed pricing and working enquiries
- `/admin` is invite-only, responsive, auditable, and fully usable on mobile, tablet, and desktop
- existing CSV data is imported with no silent loss and invoice allocations reconcile
- requests, clients, jobs, tasks/assets, pipeline, invoices, payments, expenses, pricing, finance, analytics, and tax estimates operate end to end
- analytics provides click, active-time, acquisition, package, funnel, and performance insight without collecting unnecessary personal data
- security/RLS, accessibility, performance, backup/restore, and tax-calculation tests pass
- owner documentation explains daily workflows, finance assumptions, publishing, user access, data export, and incident recovery

## 18. Official reference baseline

- [ATO — Business structures and sole-trader tax obligations](https://www.ato.gov.au/Business/Starting-your-own-business/Business-structures---key-tax-obligations/)
- [Australian Treasury — 2026–27 resident income-tax rates](https://ministers.treasury.gov.au/ministers/jim-chalmers-2022/media-releases/new-cost-living-tax-cuts-under-labor)
- [ATO — Medicare levy guidance](https://www.ato.gov.au/myTax25MedicareLevy)
- [ATO — Registering for GST](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst)
- [ATO — Small business income-tax offset](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/concessions-offsets-and-rebates/small-business-income-tax-offset)
- [ATO — PAYG instalments](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/payg-instalments)
- [OAIC — APP 1, open and transparent management](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-1-app-1-open-and-transparent-management-of-personal-information)
- [OAIC — APP 5 collection notices](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-5-app-5-notification-of-the-collection-of-personal-information)
- [OAIC — APP 3 and data minimisation](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-3-app-3-collection-of-solicited-personal-information)
- [Vercel — Web Analytics](https://vercel.com/docs/analytics)
- [Vercel — Analytics privacy and compliance](https://vercel.com/docs/analytics/privacy-policy)
- [Vercel — Web Analytics API](https://vercel.com/changelog/web-analytics-api)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js — App Router](https://nextjs.org/docs/app)
