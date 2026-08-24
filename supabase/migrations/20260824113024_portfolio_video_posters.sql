-- Keep a lightweight preview image beside portfolio videos so visitors see a
-- meaningful frame before the much larger media file is ready to play.

alter table public."website-portfolio-items"
  add column poster_path text,
  add column poster_url text,
  add constraint "website-portfolio-items-poster-pair-check"
    check ((poster_path is null) = (poster_url is null)),
  add constraint "website-portfolio-items-poster-kind-check"
    check (poster_path is null or media_kind = 'video'),
  add constraint "website-portfolio-items-poster-copy-check"
    check (
      (poster_path is null or char_length(poster_path) between 10 and 500)
      and (poster_url is null or char_length(poster_url) between 20 and 2000)
    );

create unique index "website-portfolio-items-poster-path-key"
  on public."website-portfolio-items" (poster_path)
  where poster_path is not null;
