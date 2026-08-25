# TruShot website database notes

## Portfolio category logos

`public."website-portfolio-categories"` stores one optional public logo per category:

- `logo_path` is the object key in the existing public `website-media` bucket.
- `logo_url` is its matching public CDN URL.
- Both fields must be null together or populated together.
- Logo objects use `{workspace_id}/portfolio/logos/{uuid}.{png|jpg|jpeg|webp}`. Every replacement receives a new UUID path so browser and CDN caches cannot retain the previous image.

The existing category RLS policies remain authoritative: anonymous users can only read published TruShot categories, while authenticated workspace members can create, update and remove category logo references. Existing portfolio storage policies cover member uploads and cleanup beneath the workspace's `portfolio` folder.

## Standalone portfolio logos

`public."website-portfolio-logos"` stores public banner logos that are not related to a portfolio category:

- `name` is derived from the uploaded filename and supplies the accessible collaborator label in the public marquee.
- `logo_path` is unique and uses `{workspace_id}/portfolio/logos/misc/{uuid}.{png|jpg|jpeg|webp}` in the existing public `website-media` bucket.
- `logo_url` is validated against the exact public bucket object path before the database record is created.
- `position` preserves batch upload order and leaves room for future manual sorting; `is_published` controls anonymous visibility.

Row-level security gives anonymous visitors read access only to published TruShot records. Authenticated workspace members can create and remove records, and removals also clean up the matching Storage object through the Storage API. Explicit table grants expose only `select` to `anon` and CRUD to `authenticated`.
