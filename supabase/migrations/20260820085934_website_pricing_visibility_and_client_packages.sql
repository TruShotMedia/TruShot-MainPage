-- Let the owner control whether public pricing is visible without exposing the
-- rest of the private business settings to anonymous visitors.
alter table public."website-settings"
  add column if not exists show_pricing boolean not null default true;

drop policy if exists "website-settings-public-select" on public."website-settings";
create policy "website-settings-public-select" on public."website-settings"
for select to anon
using (workspace_id = '11111111-1111-4111-8111-111111111111'::uuid);

grant select (workspace_id, show_pricing) on public."website-settings" to anon;

-- A package can be selected for a client independently of an individual job.
alter table public."website-clients"
  add column if not exists package_id uuid;

alter table public."website-clients"
  add constraint "website-clients-package-fkey"
  foreign key (package_id)
  references public."website-pricing-packages" (id)
  on delete set null;

create index "website-clients-package-idx"
  on public."website-clients" (package_id)
  where package_id is not null;

-- Preserve package choices from enquiries that were already approved.
update public."website-clients" as client
set package_id = source.package_id
from (
  select distinct on (converted_client_id)
    converted_client_id,
    package_id
  from public."website-enquiries"
  where converted_client_id is not null
    and package_id is not null
  order by converted_client_id, created_at desc
) as source
where client.id = source.converted_client_id
  and client.package_id is null;

-- Enforce the visibility setting at the database boundary too. Hidden pricing
-- accepts general enquiries, but never a forged or stale package selection.
drop policy if exists "website-enquiries-public-insert" on public."website-enquiries";
create policy "website-enquiries-public-insert" on public."website-enquiries"
for insert to anon
with check (
  workspace_id = '11111111-1111-4111-8111-111111111111'::uuid
  and status = 'new'
  and reviewed_at is null
  and reviewed_by is null
  and converted_client_id is null
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
