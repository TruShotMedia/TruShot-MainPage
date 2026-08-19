-- Admin-managed public website copy and media, scoped to TruShot's workspace.

create table public."website-site-elements" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  element_key text not null,
  element_type text not null,
  eyebrow text,
  title text not null,
  body text not null,
  media_kind text not null default 'none',
  media_url text,
  media_path text,
  media_alt text,
  position smallint not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-site-elements-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-site-elements-workspace-key" unique (workspace_id, element_key),
  constraint "website-site-elements-type-check"
    check (element_type in ('service', 'about')),
  constraint "website-site-elements-key-check"
    check (element_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(element_key) <= 80),
  constraint "website-site-elements-media-kind-check"
    check (media_kind in ('none', 'video', 'image')),
  constraint "website-site-elements-media-type-check"
    check (
      (element_type = 'service' and media_kind in ('none', 'video'))
      or (element_type = 'about' and media_kind in ('none', 'image'))
    ),
  constraint "website-site-elements-media-pair-check"
    check (
      (media_kind = 'none' and media_url is null and media_path is null)
      or (media_kind in ('video', 'image') and media_url is not null and media_path is not null)
    ),
  constraint "website-site-elements-copy-check"
    check (
      char_length(title) between 2 and 120
      and char_length(body) between 10 and 700
      and (eyebrow is null or char_length(eyebrow) <= 100)
      and (media_alt is null or char_length(media_alt) <= 180)
    )
);

create index "website-site-elements-workspace-position-idx"
  on public."website-site-elements" (workspace_id, position)
  where is_published;

create trigger "website-site-elements-updated-at"
before update on public."website-site-elements"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-site-elements" enable row level security;

create policy "website-site-elements-public-select"
on public."website-site-elements"
for select to anon
using (is_published);

create policy "website-site-elements-member-all"
on public."website-site-elements"
for all to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-site-elements" from anon, authenticated;
grant select on public."website-site-elements" to anon;
grant select, insert, update, delete on public."website-site-elements" to authenticated;

-- Public CDN bucket. Public means read-only delivery; uploads still require storage.objects RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-media',
  'website-media',
  true,
  83886080,
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "website-media-member-insert"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'website-media'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and lower(storage.extension(name)) in ('mp4', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'avif')
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
);

insert into public."website-site-elements"
  (workspace_id, element_key, element_type, eyebrow, title, body, media_kind, media_alt, position)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'service-content',
    'service',
    'Always-on attention',
    'Content systems',
    'Strategic short-form video and photography built into a consistent engine for attention, trust and demand.',
    'none',
    'TruShot Media content production in action',
    10
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'service-brand',
    'service',
    'Be known for something',
    'Brand growth',
    'Positioning and stories that make the right audience understand your value, remember your name and choose you.',
    'none',
    'A TruShot Media brand story production',
    20
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'service-campaigns',
    'service',
    'Turn attention into action',
    'Campaign momentum',
    'Connected creative, distribution and iteration designed around a business goal—not a pile of disconnected assets.',
    'none',
    'A TruShot Media campaign being produced',
    30
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'about-growth-partner',
    'about',
    'Your creative growth partner',
    'Creative that moves the business.',
    'TruShot Media partners with ambitious businesses to build attention, trust and demand. We connect strategy, production and ongoing optimisation in one direct collaboration—from the first idea to measurable momentum.',
    'none',
    'The TruShot Media team working with a client',
    40
  )
on conflict (workspace_id, element_key) do nothing;
