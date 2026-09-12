-- First-class campaign planning for the TruShot CRM.
-- Campaigns group a client's ordered, date-aware deliverables without coupling
-- them to jobs. Every exposed object keeps the required website- prefix.

create table public."website-campaigns" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid,
  title text not null,
  objective text,
  status text not null default 'planning',
  start_date date,
  due_date date,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint "website-campaigns-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-campaigns-client-fkey"
    foreign key (client_id) references public."website-clients" (id) on delete set null,
  constraint "website-campaigns-created-by-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-campaigns-updated-by-fkey"
    foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-campaigns-title-check"
    check (char_length(btrim(title)) between 2 and 180),
  constraint "website-campaigns-objective-check"
    check (objective is null or char_length(objective) <= 3000),
  constraint "website-campaigns-notes-check"
    check (notes is null or char_length(notes) <= 8000),
  constraint "website-campaigns-status-check"
    check (status in ('planning', 'active', 'paused', 'complete')),
  constraint "website-campaigns-date-window-check"
    check (start_date is null or due_date is null or due_date >= start_date)
);

create table public."website-campaign-assets" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  invoice_id uuid,
  status_id uuid not null,
  title text not null,
  description text,
  asset_type text,
  priority text not null default 'normal',
  start_date date,
  due_date date,
  location text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  position integer not null default 0,
  completed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint "website-campaign-assets-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-campaign-assets-campaign-fkey"
    foreign key (campaign_id) references public."website-campaigns" (id) on delete cascade,
  constraint "website-campaign-assets-invoice-fkey"
    foreign key (invoice_id) references public."website-invoices" (id) on delete set null,
  constraint "website-campaign-assets-status-fkey"
    foreign key (status_id) references public."website-task-statuses" (id),
  constraint "website-campaign-assets-created-by-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-campaign-assets-updated-by-fkey"
    foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-campaign-assets-title-check"
    check (char_length(btrim(title)) between 2 and 220),
  constraint "website-campaign-assets-description-check"
    check (description is null or char_length(description) <= 3000),
  constraint "website-campaign-assets-asset-type-check"
    check (asset_type is null or char_length(asset_type) <= 100),
  constraint "website-campaign-assets-priority-check"
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint "website-campaign-assets-location-check"
    check (location is null or char_length(location) <= 300),
  constraint "website-campaign-assets-contact-name-check"
    check (contact_name is null or char_length(contact_name) <= 160),
  constraint "website-campaign-assets-contact-email-check"
    check (contact_email is null or char_length(contact_email) <= 254),
  constraint "website-campaign-assets-contact-phone-check"
    check (contact_phone is null or char_length(contact_phone) <= 50),
  constraint "website-campaign-assets-notes-check"
    check (notes is null or char_length(notes) <= 8000),
  constraint "website-campaign-assets-position-check"
    check (position >= 0),
  constraint "website-campaign-assets-date-window-check"
    check (start_date is null or due_date is null or due_date >= start_date)
);

create table public."website-campaign-attachments" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_asset_id uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint "website-campaign-attachments-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-campaign-attachments-asset-fkey"
    foreign key (campaign_asset_id) references public."website-campaign-assets" (id) on delete cascade,
  constraint "website-campaign-attachments-created-by-fkey"
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-campaign-attachments-storage-path-key" unique (storage_path),
  constraint "website-campaign-attachments-file-name-check"
    check (char_length(btrim(file_name)) between 1 and 255),
  constraint "website-campaign-attachments-mime-check"
    check (char_length(btrim(mime_type)) between 3 and 150),
  constraint "website-campaign-attachments-size-check"
    check (file_size_bytes between 1 and 104857600),
  constraint "website-campaign-attachments-storage-path-check"
    check (char_length(storage_path) between 40 and 600)
);

create index "website-campaigns-workspace-status-dates-idx"
  on public."website-campaigns" (workspace_id, status, due_date, start_date)
  where archived_at is null;

create index "website-campaigns-client-idx"
  on public."website-campaigns" (client_id)
  where client_id is not null and archived_at is null;

create index "website-campaign-assets-campaign-order-idx"
  on public."website-campaign-assets" (campaign_id, due_date, start_date, position, created_at)
  where archived_at is null;

create index "website-campaign-assets-workspace-due-idx"
  on public."website-campaign-assets" (workspace_id, due_date)
  where archived_at is null;

create index "website-campaign-assets-invoice-idx"
  on public."website-campaign-assets" (invoice_id)
  where invoice_id is not null and archived_at is null;

create index "website-campaign-attachments-asset-idx"
  on public."website-campaign-attachments" (campaign_asset_id, created_at);

create trigger "website-campaigns-updated-at"
before update on public."website-campaigns"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-campaign-assets-updated-at"
before update on public."website-campaign-assets"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-campaigns" enable row level security;
alter table public."website-campaign-assets" enable row level security;
alter table public."website-campaign-attachments" enable row level security;

create policy "website-campaigns-member-select" on public."website-campaigns"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaigns-member-insert" on public."website-campaigns"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaigns-member-update" on public."website-campaigns"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaigns-member-delete" on public."website-campaigns"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaign-assets-member-select" on public."website-campaign-assets"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaign-assets-member-insert" on public."website-campaign-assets"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaign-assets-member-update" on public."website-campaign-assets"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaign-assets-member-delete" on public."website-campaign-assets"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaign-attachments-member-select" on public."website-campaign-attachments"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaign-attachments-member-insert" on public."website-campaign-attachments"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaign-attachments-member-update" on public."website-campaign-attachments"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-campaign-attachments-member-delete" on public."website-campaign-attachments"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-campaigns", public."website-campaign-assets", public."website-campaign-attachments"
from anon, authenticated;
grant select, insert, update, delete on public."website-campaigns", public."website-campaign-assets", public."website-campaign-attachments"
to authenticated;

-- Attachments are private. The object key begins with the workspace UUID so
-- storage RLS can enforce the same membership boundary as the metadata rows.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-campaign-attachments',
  'website-campaign-attachments',
  false,
  104857600,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/x-quicktime',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "website-campaign-attachments-storage-select" on storage.objects
for select to authenticated
using (
  bucket_id = 'website-campaign-attachments'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
);

create policy "website-campaign-attachments-storage-insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'website-campaign-attachments'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'campaigns'
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
);

create policy "website-campaign-attachments-storage-update" on storage.objects
for update to authenticated
using (
  bucket_id = 'website-campaign-attachments'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'campaigns'
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
)
with check (
  bucket_id = 'website-campaign-attachments'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'campaigns'
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
);

create policy "website-campaign-attachments-storage-delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'website-campaign-attachments'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and (storage.foldername(name))[2] = 'campaigns'
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
);
