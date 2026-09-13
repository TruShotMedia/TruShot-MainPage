-- Cover the nullable auth.user foreign keys identified by the database
-- performance advisor. These keep creator-based maintenance predictable as
-- saved analytics views and marketing spend history grow.
create index if not exists "website-analytics-saved-views-created-by-idx"
  on public."website-analytics-saved-views" (created_by)
  where created_by is not null;

create index if not exists "website-marketing-spend-created-by-idx"
  on public."website-marketing-spend" (created_by)
  where created_by is not null;
