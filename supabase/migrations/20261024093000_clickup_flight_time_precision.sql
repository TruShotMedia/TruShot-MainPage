alter table public."website-clickup-flight-event-links"
  add column if not exists mapping_version integer not null default 1;

alter table public."website-clickup-flight-event-links"
  drop constraint if exists "website-clickup-flight-event-links-mapping-version-check";

alter table public."website-clickup-flight-event-links"
  add constraint "website-clickup-flight-event-links-mapping-version-check"
  check (mapping_version > 0);

comment on column public."website-clickup-flight-event-links".mapping_version is
  'Version of the CRM-to-ClickUp flight payload last applied. Used to safely reconcile payload upgrades such as time-aware calendar dates.';
