-- Revenue attribution, finance reporting, and secure receipt capture for the
-- TruShot CRM. Every application-owned object keeps the website- prefix.

alter table public."website-enquiries"
  add column if not exists analytics_anonymous_id uuid,
  add column if not exists analytics_session_id uuid;

alter table public."website-enquiries"
  drop constraint if exists "website-enquiries-analytics-session-fkey",
  add constraint "website-enquiries-analytics-session-fkey"
    foreign key (analytics_session_id)
    references public."website-analytics-sessions" (id)
    on delete set null;

create index if not exists "website-enquiries-analytics-anonymous-idx"
  on public."website-enquiries" (workspace_id, analytics_anonymous_id)
  where analytics_anonymous_id is not null;

create index if not exists "website-enquiries-analytics-session-idx"
  on public."website-enquiries" (analytics_session_id)
  where analytics_session_id is not null;

create table if not exists public."website-analytics-saved-views" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  range_days integer not null default 30,
  comparison_mode text not null default 'previous_period',
  is_default boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-analytics-saved-views-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-analytics-saved-views-created-by-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-analytics-saved-views-name-key" unique (workspace_id, name),
  constraint "website-analytics-saved-views-name-check"
    check (char_length(btrim(name)) between 1 and 80),
  constraint "website-analytics-saved-views-range-check"
    check (range_days between 1 and 730),
  constraint "website-analytics-saved-views-comparison-check"
    check (comparison_mode in ('previous_period', 'previous_year'))
);

create unique index if not exists "website-analytics-saved-views-default-idx"
  on public."website-analytics-saved-views" (workspace_id)
  where is_default;

create table if not exists public."website-analytics-alert-settings" (
  workspace_id uuid primary key,
  enabled boolean not null default true,
  sensitivity_percent integer not null default 30,
  minimum_visitors integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-analytics-alert-settings-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-analytics-alert-settings-sensitivity-check"
    check (sensitivity_percent between 10 and 200),
  constraint "website-analytics-alert-settings-minimum-check"
    check (minimum_visitors between 1 and 10000)
);

create table if not exists public."website-marketing-spend" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  spend_on date not null,
  source text not null,
  campaign text,
  amount_cents bigint not null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint "website-marketing-spend-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-marketing-spend-created-by-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-marketing-spend-source-check"
    check (char_length(btrim(source)) between 1 and 100),
  constraint "website-marketing-spend-campaign-check"
    check (campaign is null or char_length(campaign) <= 180),
  constraint "website-marketing-spend-amount-check" check (amount_cents >= 0),
  constraint "website-marketing-spend-notes-check"
    check (notes is null or char_length(notes) <= 1000)
);

create index if not exists "website-marketing-spend-workspace-date-idx"
  on public."website-marketing-spend" (workspace_id, spend_on desc)
  where archived_at is null;

alter table public."website-expenses"
  add column if not exists client_id uuid,
  add column if not exists campaign_id uuid,
  add column if not exists receipt_path text,
  add column if not exists receipt_file_name text,
  add column if not exists receipt_mime_type text,
  add column if not exists receipt_size_bytes bigint,
  add column if not exists receipt_extraction jsonb not null default '{}'::jsonb;

alter table public."website-expenses"
  drop constraint if exists "website-expenses-client-fkey",
  add constraint "website-expenses-client-fkey"
    foreign key (client_id) references public."website-clients" (id) on delete set null,
  drop constraint if exists "website-expenses-campaign-fkey",
  add constraint "website-expenses-campaign-fkey"
    foreign key (campaign_id) references public."website-campaigns" (id) on delete set null,
  drop constraint if exists "website-expenses-receipt-path-check",
  add constraint "website-expenses-receipt-path-check"
    check (receipt_path is null or char_length(receipt_path) between 40 and 600),
  drop constraint if exists "website-expenses-receipt-file-check",
  add constraint "website-expenses-receipt-file-check"
    check (receipt_file_name is null or char_length(btrim(receipt_file_name)) between 1 and 255),
  drop constraint if exists "website-expenses-receipt-mime-check",
  add constraint "website-expenses-receipt-mime-check"
    check (receipt_mime_type is null or receipt_mime_type in (
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'
    )),
  drop constraint if exists "website-expenses-receipt-size-check",
  add constraint "website-expenses-receipt-size-check"
    check (receipt_size_bytes is null or receipt_size_bytes between 1 and 20971520),
  drop constraint if exists "website-expenses-receipt-fields-check",
  add constraint "website-expenses-receipt-fields-check"
    check (
      (receipt_path is null and receipt_file_name is null and receipt_mime_type is null and receipt_size_bytes is null)
      or
      (receipt_path is not null and receipt_file_name is not null and receipt_mime_type is not null and receipt_size_bytes is not null)
    ),
  drop constraint if exists "website-expenses-extraction-size-check",
  add constraint "website-expenses-extraction-size-check"
    check (pg_column_size(receipt_extraction) <= 8192);

create unique index if not exists "website-expenses-receipt-path-key"
  on public."website-expenses" (receipt_path)
  where receipt_path is not null;

create index if not exists "website-expenses-client-idx"
  on public."website-expenses" (client_id)
  where client_id is not null and archived_at is null;

create index if not exists "website-expenses-campaign-idx"
  on public."website-expenses" (campaign_id)
  where campaign_id is not null and archived_at is null;

drop trigger if exists "website-analytics-saved-views-updated-at" on public."website-analytics-saved-views";
create trigger "website-analytics-saved-views-updated-at"
before update on public."website-analytics-saved-views"
for each row execute function "website-private"."website-set-updated-at"();

drop trigger if exists "website-analytics-alert-settings-updated-at" on public."website-analytics-alert-settings";
create trigger "website-analytics-alert-settings-updated-at"
before update on public."website-analytics-alert-settings"
for each row execute function "website-private"."website-set-updated-at"();

drop trigger if exists "website-marketing-spend-updated-at" on public."website-marketing-spend";
create trigger "website-marketing-spend-updated-at"
before update on public."website-marketing-spend"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-analytics-saved-views" enable row level security;
alter table public."website-analytics-alert-settings" enable row level security;
alter table public."website-marketing-spend" enable row level security;

create policy "website-analytics-saved-views-admin-all" on public."website-analytics-saved-views"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-analytics-alert-settings-admin-all" on public."website-analytics-alert-settings"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-marketing-spend-admin-all" on public."website-marketing-spend"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

revoke all on
  public."website-analytics-saved-views",
  public."website-analytics-alert-settings",
  public."website-marketing-spend"
from anon, authenticated;

grant select, insert, update, delete on
  public."website-analytics-saved-views",
  public."website-analytics-alert-settings",
  public."website-marketing-spend"
to authenticated;

-- Website analytics are accepted only by the validated server route. This
-- removes direct anonymous table writes and fixes session upserts without
-- granting public SELECT access to session rows.
drop policy if exists "website-analytics-sessions-public-insert" on public."website-analytics-sessions";
drop policy if exists "website-analytics-sessions-public-update" on public."website-analytics-sessions";
drop policy if exists "website-analytics-events-public-insert" on public."website-analytics-events";
revoke insert, update on public."website-analytics-sessions" from anon;
revoke insert on public."website-analytics-events" from anon;

drop policy if exists "website-enquiries-public-insert" on public."website-enquiries";
revoke insert on public."website-enquiries" from anon;

grant select, insert, update on public."website-analytics-sessions" to service_role;
grant select, insert on public."website-analytics-events" to service_role;
grant select, insert on public."website-enquiries" to service_role;

insert into public."website-analytics-alert-settings" (workspace_id)
values ('11111111-1111-4111-8111-111111111111')
on conflict (workspace_id) do nothing;

insert into public."website-analytics-saved-views"
  (workspace_id, name, range_days, comparison_mode, is_default)
values
  ('11111111-1111-4111-8111-111111111111', 'Last 30 days', 30, 'previous_period', true),
  ('11111111-1111-4111-8111-111111111111', 'Quarter view', 90, 'previous_period', false)
on conflict (workspace_id, name) do nothing;

-- Receipts are evidence, not public website media. They stay private and are
-- viewed through short-lived signed URLs issued after an authenticated read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-expense-receipts',
  'website-expense-receipts',
  false,
  20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "website-expense-receipts-storage-select" on storage.objects
for select to authenticated
using (
  bucket_id = 'website-expense-receipts'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'expenses'
  and (select "website-private"."website-has-finance-access"('11111111-1111-4111-8111-111111111111'::uuid))
);

create policy "website-expense-receipts-storage-insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'website-expense-receipts'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'expenses'
  and (select "website-private"."website-has-finance-access"('11111111-1111-4111-8111-111111111111'::uuid))
);

create policy "website-expense-receipts-storage-update" on storage.objects
for update to authenticated
using (
  bucket_id = 'website-expense-receipts'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'expenses'
  and (select "website-private"."website-has-finance-access"('11111111-1111-4111-8111-111111111111'::uuid))
)
with check (
  bucket_id = 'website-expense-receipts'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'expenses'
  and (select "website-private"."website-has-finance-access"('11111111-1111-4111-8111-111111111111'::uuid))
);

create policy "website-expense-receipts-storage-delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'website-expense-receipts'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'expenses'
  and (select "website-private"."website-has-finance-access"('11111111-1111-4111-8111-111111111111'::uuid))
);
