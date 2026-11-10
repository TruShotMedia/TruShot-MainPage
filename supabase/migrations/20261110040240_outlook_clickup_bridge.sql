-- Existing private Outlook snapshots remain private. Only an explicitly
-- enabled, service-managed owner/destination pair can publish minimal fields.
alter table public."website-outlook-calendars"
  add column source_format_version integer not null default 1;

create table public."website-clickup-outlook-bridge" (
  workspace_id uuid primary key references public."website-workspaces"(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  list_id text not null check (list_id ~ '^[0-9]+$'),
  enabled boolean not null default false,
  enabled_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  next_sync_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  last_counts jsonb not null default '{}'::jsonb,
  failure_count integer not null default 0
);
create index "website-clickup-outlook-bridge-owner-idx" on public."website-clickup-outlook-bridge"(user_id);
create table public."website-clickup-outlook-links" (
  workspace_id uuid not null references public."website-clickup-outlook-bridge"(workspace_id),
  calendar_id uuid not null,
  event_id text not null check (event_id ~ '^outlook-[0-9a-f]{32}$'),
  clickup_task_id text,
  last_payload_hash text,
  create_attempted_at timestamptz,
  archived_at timestamptz,
  last_synced_at timestamptz,
  primary key (workspace_id, calendar_id, event_id),
  unique (workspace_id, clickup_task_id)
);
-- No calendar FK: retain tombstones after disconnect so remote mirrors can be
-- archived. Never store the Outlook URL or appointment description here.
comment on table public."website-clickup-outlook-links" is 'Service-only Outlook mirror identities, retained for safe cancellation/disconnect cleanup.';
alter table public."website-clickup-outlook-bridge" enable row level security;
alter table public."website-clickup-outlook-links" enable row level security;
revoke all on public."website-clickup-outlook-bridge", public."website-clickup-outlook-links" from public, anon, authenticated;
grant select, insert, update on public."website-clickup-outlook-bridge", public."website-clickup-outlook-links" to service_role;
create policy "outlook-bridge-service" on public."website-clickup-outlook-bridge"
  for all to service_role using (true) with check (true);
create policy "outlook-links-service" on public."website-clickup-outlook-links"
  for all to service_role using (true) with check (true);

-- Short DB transactions; never hold a row lock during an external HTTP call.
create function public."website-clickup-outlook-lease"(p_workspace_id uuid,p_token uuid,p_action text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_token is null then return false; end if;
  if p_action = 'claim' then
    update public."website-clickup-outlook-bridge" set lease_token=p_token,lease_until=clock_timestamp()+interval '3 minutes'
    where workspace_id=p_workspace_id and enabled and next_sync_at<=clock_timestamp()
      and (lease_until is null or lease_until<clock_timestamp());
  elsif p_action = 'renew' then
    update public."website-clickup-outlook-bridge" set lease_until=clock_timestamp()+interval '3 minutes'
    where workspace_id=p_workspace_id and enabled and lease_token=p_token and lease_until>clock_timestamp();
  elsif p_action = 'release' then
    update public."website-clickup-outlook-bridge" set lease_token=null,lease_until=null
    where workspace_id=p_workspace_id and lease_token=p_token;
  else raise exception 'Unknown Outlook bridge lease action'; end if;
  return found;
end $$;
revoke all on function public."website-clickup-outlook-lease"(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public."website-clickup-outlook-lease"(uuid,uuid,text) to service_role;
