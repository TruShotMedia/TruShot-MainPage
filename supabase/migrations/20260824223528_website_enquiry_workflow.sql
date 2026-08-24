-- Preserve the complete decision history for website client requests while
-- keeping rejected work out of the active inbox when it is archived.

alter table public."website-enquiries"
  add column rejection_reason text,
  add column internal_notes text,
  add column archived_at timestamptz,
  add column archived_by uuid;

alter table public."website-enquiries"
  add constraint "website-enquiries-archiver-fkey"
    foreign key (archived_by) references auth.users (id) on delete set null,
  add constraint "website-enquiries-rejection-reason-check"
    check (
      rejection_reason is null
      or char_length(trim(rejection_reason)) between 3 and 1000
    ),
  add constraint "website-enquiries-rejected-reason-required-check"
    check (
      status not in ('declined', 'archived')
      or rejection_reason is not null
    ),
  add constraint "website-enquiries-internal-notes-check"
    check (internal_notes is null or char_length(internal_notes) <= 2000),
  add constraint "website-enquiries-archive-state-check"
    check ((status = 'archived') = (archived_at is not null));

create index "website-enquiries-workspace-archived-idx"
  on public."website-enquiries" (workspace_id, archived_at desc)
  where archived_at is not null;

-- New public submissions must never be able to populate CRM-only review or
-- archival fields. Package validation mirrors the current pricing policy.
drop policy if exists "website-enquiries-public-insert" on public."website-enquiries";
create policy "website-enquiries-public-insert" on public."website-enquiries"
for insert to anon
with check (
  workspace_id = '11111111-1111-4111-8111-111111111111'::uuid
  and status = 'new'
  and reviewed_at is null
  and reviewed_by is null
  and converted_client_id is null
  and rejection_reason is null
  and internal_notes is null
  and archived_at is null
  and archived_by is null
  and (
    (package_id is null and pricing_version_id is null)
    or (
      exists (
        select 1
        from public."website-settings" as settings
        where settings.workspace_id = '11111111-1111-4111-8111-111111111111'::uuid
          and settings.show_pricing
      )
      and exists (
        select 1
        from public."website-pricing-packages" as package
        join public."website-pricing-versions" as version
          on version.id = package.version_id
        where package.id = "website-enquiries".package_id
          and package.version_id = "website-enquiries".pricing_version_id
          and package.workspace_id = "website-enquiries".workspace_id
          and package.is_active
          and version.status = 'published'
      )
    )
  )
);
