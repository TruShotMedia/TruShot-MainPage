-- Every public website media slot can now contain either a supported image or video.
-- The existing media-kind and media-pair constraints continue to enforce valid values.

alter table public."website-site-elements"
  drop constraint if exists "website-site-elements-media-type-check";
