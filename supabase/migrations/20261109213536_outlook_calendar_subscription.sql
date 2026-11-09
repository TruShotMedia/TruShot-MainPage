-- Applied remote migration version: 20261109214640.
-- Published URLs are bearer secrets. Browser sessions can read only the
-- authorised calendar snapshot; credentials and HTTP validators are service-only.
create table public."website-outlook-calendars" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces"(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array' and jsonb_array_length(events) <= 2000),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  failure_count integer not null default 0,
  next_sync_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
alter table public."website-outlook-calendars" enable row level security;
revoke all on public."website-outlook-calendars" from public, anon, authenticated;
grant select (id, workspace_id, user_id, name, events, last_success_at, last_attempt_at, last_error, created_at, updated_at)
  on public."website-outlook-calendars" to authenticated;
grant all on public."website-outlook-calendars" to service_role;
create policy "own-active-outlook-calendar" on public."website-outlook-calendars" for select to authenticated using (
  user_id = (select auth.uid()) and (
    (select "website-private"."website-has-workspace-access"(workspace_id))
    or (select "website-private"."website-has-portal-access"(workspace_id, 'autopacific'))
  )
);
create index "website-outlook-calendars-due" on public."website-outlook-calendars" (next_sync_at);

create table public."website-outlook-feed-secrets" (
  calendar_id uuid primary key references public."website-outlook-calendars"(id) on delete cascade,
  encrypted_url jsonb not null,
  etag text,
  last_modified text,
  expanded_on date
);
alter table public."website-outlook-feed-secrets" enable row level security;
revoke all on public."website-outlook-feed-secrets" from public, anon, authenticated;
grant all on public."website-outlook-feed-secrets" to service_role;
create policy "outlook-worker-only" on public."website-outlook-feed-secrets" for all to service_role using (true) with check (true);

comment on table public."website-outlook-calendars" is 'Private owner-only, read-only Outlook snapshots. Never CRM jobs, ClickUp tasks or reminder sources.';
comment on table public."website-outlook-feed-secrets" is 'Service-only AES-GCM encrypted subscription URLs. Never serialize or log this table.';
