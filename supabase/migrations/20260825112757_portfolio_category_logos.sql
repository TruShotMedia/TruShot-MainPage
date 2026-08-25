-- Optional client/category logos power the public portfolio credibility marquee.
-- A unique object path is used for each replacement so the public CDN never
-- serves a stale logo after an admin update.

alter table public."website-portfolio-categories"
  add column logo_path text,
  add column logo_url text;

alter table public."website-portfolio-categories"
  add constraint "website-portfolio-categories-logo-check"
  check (
    (logo_path is null and logo_url is null)
    or (
      logo_path is not null
      and logo_url is not null
      and char_length(logo_path) between 10 and 500
      and char_length(logo_url) between 20 and 2000
    )
  );

comment on column public."website-portfolio-categories".logo_path is
  'Public website-media object path for the optional category logo.';

comment on column public."website-portfolio-categories".logo_url is
  'Public CDN URL for the optional category logo shown in the portfolio marquee.';
