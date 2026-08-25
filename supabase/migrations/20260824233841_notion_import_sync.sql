begin;

create table public."website-notion-sync-state" (
  workspace_id uuid primary key,
  status text not null default 'idle',
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_successful_at timestamptz,
  next_sync_at timestamptz,
  lock_until timestamptz,
  last_error text,
  last_result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint "website-notion-sync-state-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-notion-sync-state-status-check"
    check (status in ('idle', 'running', 'completed', 'failed'))
);

create table public."website-notion-links" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  notion_page_id text not null,
  entity_type text not null,
  entity_id uuid not null,
  notion_last_edited_at timestamptz,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint "website-notion-links-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-notion-links-entity-type-check"
    check (entity_type in ('client', 'job', 'task')),
  constraint "website-notion-links-page-key"
    unique (workspace_id, notion_page_id),
  constraint "website-notion-links-entity-key"
    unique (workspace_id, entity_type, entity_id)
);

create trigger "website-notion-sync-state-updated-at"
before update on public."website-notion-sync-state"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-notion-sync-state" enable row level security;
alter table public."website-notion-links" enable row level security;

create policy "website-notion-sync-state-member-select"
on public."website-notion-sync-state"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-notion-sync-state-member-update"
on public."website-notion-sync-state"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-notion-links-member-select"
on public."website-notion-links"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-notion-links-member-insert"
on public."website-notion-links"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

revoke all on public."website-notion-sync-state" from anon;
revoke all on public."website-notion-links" from anon;
grant select, update on public."website-notion-sync-state" to authenticated;
grant select, insert on public."website-notion-links" to authenticated;

create or replace function public."website-claim-notion-sync"(
  p_workspace_id uuid,
  p_force boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed boolean := false;
begin
  if not (select "website-private"."website-has-workspace-access"(p_workspace_id)) then
    return false;
  end if;

  update public."website-notion-sync-state"
  set
    status = 'running',
    last_started_at = now(),
    lock_until = now() + interval '5 minutes',
    last_error = null
  where workspace_id = p_workspace_id
    and (lock_until is null or lock_until < now())
    and (p_force or next_sync_at is null or next_sync_at <= now())
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public."website-claim-notion-sync"(uuid, boolean) from public, anon;
grant execute on function public."website-claim-notion-sync"(uuid, boolean) to authenticated;

insert into public."website-notion-sync-state" (workspace_id)
values ('11111111-1111-4111-8111-111111111111')
on conflict (workspace_id) do nothing;

commit;
