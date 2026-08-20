-- Organise the private portfolio into named collections. Existing media is
-- preserved by placing it in a default collection before category_id becomes
-- required.

create table public."website-portfolio-categories" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  slug text not null,
  description text,
  position integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-portfolio-categories-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-portfolio-categories-workspace-slug-key" unique (workspace_id, slug),
  constraint "website-portfolio-categories-copy-check"
    check (
      char_length(name) between 2 and 80
      and char_length(slug) between 1 and 90
      and (description is null or char_length(description) <= 280)
    )
);

create index "website-portfolio-categories-workspace-position-idx"
  on public."website-portfolio-categories" (workspace_id, position, created_at)
  where is_published;

create index "website-portfolio-categories-created-by-idx"
  on public."website-portfolio-categories" (created_by)
  where created_by is not null;

create trigger "website-portfolio-categories-updated-at"
before update on public."website-portfolio-categories"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-portfolio-categories" enable row level security;

create policy "website-portfolio-categories-public-select"
on public."website-portfolio-categories"
for select to anon
using (
  workspace_id = '11111111-1111-4111-8111-111111111111'::uuid
  and is_published
);

create policy "website-portfolio-categories-member-all"
on public."website-portfolio-categories"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-portfolio-categories" from anon, authenticated;
grant select on public."website-portfolio-categories" to anon;
grant select, insert, update, delete on public."website-portfolio-categories" to authenticated;

-- Only workspaces with existing media receive the compatibility collection.
insert into public."website-portfolio-categories" (
  workspace_id,
  name,
  slug,
  description,
  position,
  is_published,
  created_by
)
select
  items.workspace_id,
  'Selected work',
  'selected-work',
  'A considered selection of motion and stills.',
  10,
  true,
  min(items.created_by::text)::uuid
from public."website-portfolio-items" items
group by items.workspace_id;

alter table public."website-portfolio-items"
  add column category_id uuid;

update public."website-portfolio-items" items
set category_id = categories.id
from public."website-portfolio-categories" categories
where categories.workspace_id = items.workspace_id
  and categories.slug = 'selected-work';

alter table public."website-portfolio-items"
  alter column category_id set not null,
  add constraint "website-portfolio-items-category-fkey"
    foreign key (category_id)
    references public."website-portfolio-categories" (id)
    on delete restrict;

drop index if exists public."website-portfolio-items-workspace-position-idx";

create index "website-portfolio-items-workspace-category-position-idx"
  on public."website-portfolio-items" (workspace_id, category_id, position, created_at)
  where is_published;
