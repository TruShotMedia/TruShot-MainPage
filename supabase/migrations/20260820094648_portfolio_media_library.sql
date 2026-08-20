-- An unlisted, public-facing portfolio library managed from the authenticated CRM.

create table public."website-portfolio-items" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  media_kind text not null,
  title text,
  caption text,
  alt_text text not null,
  storage_path text not null,
  public_url text not null,
  display_size text not null default 'standard',
  position integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-portfolio-items-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-portfolio-items-storage-path-key" unique (storage_path),
  constraint "website-portfolio-items-media-kind-check"
    check (media_kind in ('video', 'image')),
  constraint "website-portfolio-items-display-size-check"
    check (display_size in ('standard', 'wide', 'tall')),
  constraint "website-portfolio-items-copy-check"
    check (
      (title is null or char_length(title) between 2 and 120)
      and (caption is null or char_length(caption) <= 280)
      and char_length(alt_text) between 3 and 180
      and char_length(storage_path) between 10 and 500
      and char_length(public_url) between 20 and 2000
    )
);

create index "website-portfolio-items-workspace-position-idx"
  on public."website-portfolio-items" (workspace_id, position, created_at)
  where is_published;

create index "website-portfolio-items-created-by-idx"
  on public."website-portfolio-items" (created_by)
  where created_by is not null;

create trigger "website-portfolio-items-updated-at"
before update on public."website-portfolio-items"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-portfolio-items" enable row level security;

create policy "website-portfolio-items-public-select"
on public."website-portfolio-items"
for select to anon
using (
  workspace_id = '11111111-1111-4111-8111-111111111111'::uuid
  and is_published
);

create policy "website-portfolio-items-member-all"
on public."website-portfolio-items"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-portfolio-items" from anon, authenticated;
grant select on public."website-portfolio-items" to anon;
grant select, insert, update, delete on public."website-portfolio-items" to authenticated;

-- The bucket is already public for delivery. These policies only allow signed-in
-- workspace members to inspect and remove objects inside the portfolio folder.
create policy "website-media-portfolio-member-select"
on storage.objects
for select to authenticated
using (
  bucket_id = 'website-media'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'portfolio'
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
);

create policy "website-media-portfolio-member-delete"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'website-media'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'portfolio'
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
);
