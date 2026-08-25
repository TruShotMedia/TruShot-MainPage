# TruShot CRM changelog

## 2026-08-25 — Portfolio category logo banner

- Added an optional PNG, JPG or WebP logo to every portfolio category, with upload, replacement and removal controls in the Portfolio admin page.
- Added a seamless, responsive logo marquee beneath the public portfolio's Selected work introduction. It only renders when at least one published, visible category has a logo.
- Added database-backed logo paths and public URLs with paired-value validation, unique replacement paths to avoid stale CDN content, and storage cleanup when a logo or empty category is removed.
- Extended the portfolio's view-only interaction barrier to cover displayed client logos.

## 2026-08-25 — Portfolio viewing protection

- Added an unobtrusive view-only barrier that prevents the standard context menu, media dragging and browser save shortcut on portfolio media.
- Removed native video download and picture-in-picture controls in the grid and full-screen viewer.
- Added a short private-preview notice when a visitor attempts a blocked saving action.

## 2026-08-25 — Uniform portfolio grid

- Removed the oversized first portfolio asset so every photo and video follows the same responsive collage columns and its own media ratio.
- Updated responsive image sizing for the four-column desktop and two-column tablet/mobile layouts.

## 2026-08-25 — Job invoice relationships and bulk actions

- Added searchable invoice relationships to the job editor, including safe removal of unlocked relationships and protection for locked allocations.
- Added additive bulk invoice linking for selected jobs. Existing invoice links are preserved and duplicate links remain prevented by the allocation table's unique constraint.
- Added each job's related invoices to the jobs data view so edit forms reflect the current Supabase allocation state.
- Replaced the in-flow job/task bulk action strip with a responsive floating action group that remains available while scrolling.
- Reused the existing `website-invoice-job-allocations` relationship and RLS policies; no database schema change or migration was required.
