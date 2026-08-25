-- Standalone collaborator logos can join the public portfolio marquee without
-- requiring a matching media category. Storage objects remain in the existing
-- website-media portfolio prefix so the established upload/delete policies apply.

create table public."website-portfolio-logos" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  logo_path text not null,
  logo_url text not null,
  position integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-portfolio-logos-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-portfolio-logos-logo-path-key" unique (logo_path),
  constraint "website-portfolio-logos-copy-check"
    check (char_length(name) between 1 and 100),
  constraint "website-portfolio-logos-media-check"
    check (
      char_length(logo_path) between 10 and 500
      and logo_path ~ '^[0-9a-f-]{36}/portfolio/logos/misc/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      and char_length(logo_url) between 20 and 2000
      and logo_url ~ '^https://'
    )
);

create index "website-portfolio-logos-workspace-position-idx"
  on public."website-portfolio-logos" (workspace_id, position, created_at)
  where is_published;

create index "website-portfolio-logos-created-by-idx"
  on public."website-portfolio-logos" (created_by)
  where created_by is not null;

create trigger "website-portfolio-logos-updated-at"
before update on public."website-portfolio-logos"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-portfolio-logos" enable row level security;

create policy "website-portfolio-logos-public-select"
on public."website-portfolio-logos"
for select to anon
using (
  workspace_id = '11111111-1111-4111-8111-111111111111'::uuid
  and is_published
);

create policy "website-portfolio-logos-member-all"
on public."website-portfolio-logos"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-portfolio-logos" from anon, authenticated;
grant select on public."website-portfolio-logos" to anon;
grant select, insert, update, delete on public."website-portfolio-logos" to authenticated;

comment on table public."website-portfolio-logos" is
  'Published portfolio marquee logos that do not require a portfolio category.';
