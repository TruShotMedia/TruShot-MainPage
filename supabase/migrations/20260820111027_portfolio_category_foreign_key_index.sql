-- category_id needs a leading index for category deletion checks and the
-- foreign-key ON DELETE restriction lookup.
create index "website-portfolio-items-category-idx"
  on public."website-portfolio-items" (category_id);
