-- Mirror AutoPacific manual calendar events into ClickUp without mixing them
-- with the bidirectional job integration.

alter table public."website-calendar-events"
  add column client_id uuid,
  add constraint "website-calendar-events-client-fkey"
    foreign key (client_id) references public."website-clients" (id) on delete set null;

create index "website-calendar-events-client-date-idx"
  on public."website-calendar-events" (client_id, end_date, start_date)
  where client_id is not null;

create table public."website-clickup-calendar-event-links" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  calendar_event_id uuid not null,
  clickup_task_id text not null,
  clickup_task_url text,
  source_updated_at timestamptz,
  last_synced_at timestamptz,
  last_synced_status text,
  last_inbound_at timestamptz,
  sync_state text not null default 'linked',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-calendar-event-links-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-calendar-event-links-event-key"
    unique (workspace_id, calendar_event_id),
  constraint "website-clickup-calendar-event-links-task-key"
    unique (workspace_id, clickup_task_id),
  constraint "website-clickup-calendar-event-links-sync-state-check"
    check (sync_state in ('linked', 'paused'))
);

create table public."website-clickup-calendar-event-outbox" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  calendar_event_id uuid not null,
  operation text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-calendar-event-outbox-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-calendar-event-outbox-operation-check"
    check (operation in ('upsert', 'archive', 'delete')),
  constraint "website-clickup-calendar-event-outbox-status-check"
    check (status in ('pending', 'processing', 'retry', 'completed', 'failed')),
  constraint "website-clickup-calendar-event-outbox-attempts-check"
    check (attempts between 0 and 100)
);

create index "website-clickup-calendar-event-links-event-idx"
  on public."website-clickup-calendar-event-links" (calendar_event_id);

create index "website-clickup-calendar-event-outbox-ready-idx"
  on public."website-clickup-calendar-event-outbox" (workspace_id, status, available_at, created_at)
  where status in ('pending', 'retry');

create unique index "website-clickup-calendar-event-outbox-active-event-key"
  on public."website-clickup-calendar-event-outbox" (workspace_id, calendar_event_id)
  where status in ('pending', 'retry');

create trigger "website-clickup-calendar-event-links-updated-at"
before update on public."website-clickup-calendar-event-links"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-clickup-calendar-event-outbox-updated-at"
before update on public."website-clickup-calendar-event-outbox"
for each row execute function "website-private"."website-set-updated-at"();

create or replace function "website-private"."website-queue-clickup-calendar-event-sync"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration record;
  old_is_target boolean := false;
  new_is_target boolean := false;
  queued_operation text;
  queued_event_id uuid;
begin
  select item.target_client_id, item.enabled, item.deletion_mode
  into integration
  from public."website-clickup-integrations" item
  where item.workspace_id = case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;

  if not found or not integration.enabled then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    old_is_target := old.client_id = integration.target_client_id;
  end if;
  if tg_op <> 'DELETE' then
    new_is_target := new.client_id = integration.target_client_id;
  end if;

  if tg_op = 'INSERT' and new_is_target then
    queued_operation := 'upsert';
    queued_event_id := new.id;
  elsif tg_op = 'DELETE' and old_is_target then
    queued_operation := integration.deletion_mode;
    queued_event_id := old.id;
  elsif tg_op = 'UPDATE' then
    queued_event_id := new.id;
    if old_is_target and not new_is_target then
      queued_operation := integration.deletion_mode;
    elsif new_is_target and (
      not old_is_target
      or row(
        new.title, new.description, new.location, new.start_date, new.start_time,
        new.end_date, new.end_time, new.is_all_day, new.client_id
      ) is distinct from row(
        old.title, old.description, old.location, old.start_date, old.start_time,
        old.end_date, old.end_time, old.is_all_day, old.client_id
      )
    ) then
      queued_operation := 'upsert';
    end if;
  end if;

  if queued_operation is not null then
    insert into public."website-clickup-calendar-event-outbox" (
      workspace_id,
      calendar_event_id,
      operation
    ) values (
      case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end,
      queued_event_id,
      queued_operation
    )
    on conflict (workspace_id, calendar_event_id) where status in ('pending', 'retry')
    do update set
      operation = excluded.operation,
      status = 'pending',
      attempts = 0,
      available_at = now(),
      processing_started_at = null,
      completed_at = null,
      last_error = null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function "website-private"."website-queue-clickup-calendar-event-sync"()
  from public, anon, authenticated;

create trigger "website-calendar-events-clickup-sync"
after insert or update or delete on public."website-calendar-events"
for each row execute function "website-private"."website-queue-clickup-calendar-event-sync"();

alter table public."website-clickup-calendar-event-links" enable row level security;
alter table public."website-clickup-calendar-event-outbox" enable row level security;

create policy "website-clickup-calendar-event-links-admin-all"
on public."website-clickup-calendar-event-links"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-clickup-calendar-event-outbox-admin-all"
on public."website-clickup-calendar-event-outbox"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

revoke all on public."website-clickup-calendar-event-links" from anon, authenticated, service_role;
revoke all on public."website-clickup-calendar-event-outbox" from anon, authenticated, service_role;

grant select, insert, update, delete on public."website-clickup-calendar-event-links"
  to authenticated, service_role;
grant select, insert, update, delete on public."website-clickup-calendar-event-outbox"
  to authenticated, service_role;

alter table public."website-clickup-sync-audit"
  add column calendar_event_id uuid;

create index "website-clickup-sync-audit-calendar-event-idx"
  on public."website-clickup-sync-audit" (calendar_event_id)
  where calendar_event_id is not null;

comment on column public."website-calendar-events".client_id is
  'Optional client scope. AutoPacific-scoped events are mirrored into the configured ClickUp Jobs List.';
comment on table public."website-clickup-calendar-event-links" is
  'Stable mapping between AutoPacific manual calendar events and their ClickUp tasks.';
comment on table public."website-clickup-calendar-event-outbox" is
  'Durable, retryable queue of CRM-to-ClickUp calendar event changes.';
