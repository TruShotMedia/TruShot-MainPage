# TruShot CRM changelog

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
