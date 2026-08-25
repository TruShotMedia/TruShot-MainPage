# TruShot website database notes

## Portfolio category logos

`public."website-portfolio-categories"` stores one optional public logo per category:

- `logo_path` is the object key in the existing public `website-media` bucket.
- `logo_url` is its matching public CDN URL.
- Both fields must be null together or populated together.
- Logo objects use `{workspace_id}/portfolio/logos/{uuid}.{png|jpg|jpeg|webp}`. Every replacement receives a new UUID path so browser and CDN caches cannot retain the previous image.

The existing category RLS policies remain authoritative: anonymous users can only read published TruShot categories, while authenticated workspace members can create, update and remove category logo references. Existing portfolio storage policies cover member uploads and cleanup beneath the workspace's `portfolio` folder.
