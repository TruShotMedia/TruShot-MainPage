alter table public."website-jobs"
  add column delivery_url text;

alter table public."website-jobs"
  add constraint "website-jobs-delivery-url-check"
  check (
    delivery_url is null
    or (
      char_length(delivery_url) <= 2048
      and delivery_url ~* '^https?://[^[:space:]]+$'
    )
  );

comment on column public."website-jobs".delivery_url is
  'Optional client-facing HTTP(S) link rendered in exported job work reports.';
