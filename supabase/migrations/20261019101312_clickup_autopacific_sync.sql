-- Durable one-way AutoPacific job mirroring into ClickUp.
-- ClickUp credentials stay in the application server environment and are never
-- stored in the database or exposed to browser clients.

create table public."website-clickup-integrations" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  target_client_id uuid not null,
  list_id text not null,
  list_name text not null,
  enabled boolean not null default false,
  assigned_user_id bigint,
  assigned_user_name text,
  deletion_mode text not null default 'archive',
  status_mapping jsonb not null,
  last_connected_at timestamptz,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-integrations-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-integrations-client-fkey" foreign key (target_client_id) references public."website-clients" (id) on delete restrict,
  constraint "website-clickup-integrations-workspace-key" unique (workspace_id),
  constraint "website-clickup-integrations-list-id-check" check (list_id ~ '^[0-9]+$'),
  constraint "website-clickup-integrations-deletion-mode-check" check (deletion_mode in ('archive', 'delete')),
  constraint "website-clickup-integrations-status-mapping-check" check (jsonb_typeof(status_mapping) = 'object')
);

create table public."website-clickup-job-links" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  job_id uuid not null,
  clickup_task_id text not null,
  clickup_task_url text,
  source_updated_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-job-links-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-job-links-job-key" unique (workspace_id, job_id),
  constraint "website-clickup-job-links-task-key" unique (workspace_id, clickup_task_id)
);

create table public."website-clickup-sync-outbox" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  job_id uuid not null,
  operation text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-sync-outbox-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-sync-outbox-operation-check" check (operation in ('upsert', 'archive', 'delete')),
  constraint "website-clickup-sync-outbox-status-check" check (status in ('pending', 'processing', 'retry', 'completed', 'failed')),
  constraint "website-clickup-sync-outbox-attempts-check" check (attempts between 0 and 100)
);

create index "website-clickup-integrations-client-idx"
  on public."website-clickup-integrations" (target_client_id);

create index "website-clickup-job-links-job-idx"
  on public."website-clickup-job-links" (job_id);

create index "website-clickup-sync-outbox-ready-idx"
  on public."website-clickup-sync-outbox" (status, available_at, created_at)
  where status in ('pending', 'retry');

create unique index "website-clickup-sync-outbox-active-job-key"
  on public."website-clickup-sync-outbox" (workspace_id, job_id)
  where status in ('pending', 'retry');

create trigger "website-clickup-integrations-updated-at"
before update on public."website-clickup-integrations"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-clickup-job-links-updated-at"
before update on public."website-clickup-job-links"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-clickup-sync-outbox-updated-at"
before update on public."website-clickup-sync-outbox"
for each row execute function "website-private"."website-set-updated-at"();

create or replace function "website-private"."website-queue-clickup-job-sync"()
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
  queued_job_id uuid;
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
    old_is_target := old.client_id = integration.target_client_id and old.archived_at is null;
  end if;
  if tg_op <> 'DELETE' then
    new_is_target := new.client_id = integration.target_client_id and new.archived_at is null;
  end if;

  if tg_op = 'INSERT' and new_is_target then
    queued_operation := 'upsert';
    queued_job_id := new.id;
  elsif tg_op = 'DELETE' and old_is_target then
    queued_operation := integration.deletion_mode;
    queued_job_id := old.id;
  elsif tg_op = 'UPDATE' then
    queued_job_id := new.id;
    if old_is_target and not new_is_target then
      queued_operation := integration.deletion_mode;
    elsif new_is_target and (
      not old_is_target
      or row(
        new.title, new.job_number, new.status_id, new.shoot_date, new.shoot_time,
        new.due_date, new.due_time, new.photos_delivered, new.location,
        new.delivery_url, new.description, new.notes, new.archived_at
      ) is distinct from row(
        old.title, old.job_number, old.status_id, old.shoot_date, old.shoot_time,
        old.due_date, old.due_time, old.photos_delivered, old.location,
        old.delivery_url, old.description, old.notes, old.archived_at
      )
    ) then
      queued_operation := 'upsert';
    end if;
  end if;

  if queued_operation is not null then
    insert into public."website-clickup-sync-outbox" (workspace_id, job_id, operation)
    values (
      case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end,
      queued_job_id,
      queued_operation
    )
    on conflict (workspace_id, job_id) where status in ('pending', 'retry')
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

revoke all on function "website-private"."website-queue-clickup-job-sync"() from public, anon, authenticated;

create trigger "website-jobs-clickup-sync"
after insert or update or delete on public."website-jobs"
for each row execute function "website-private"."website-queue-clickup-job-sync"();

alter table public."website-clickup-integrations" enable row level security;
alter table public."website-clickup-job-links" enable row level security;
alter table public."website-clickup-sync-outbox" enable row level security;

create policy "website-clickup-integrations-admin-all"
on public."website-clickup-integrations"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-clickup-job-links-admin-all"
on public."website-clickup-job-links"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-clickup-sync-outbox-admin-all"
on public."website-clickup-sync-outbox"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

revoke all on public."website-clickup-integrations" from anon, authenticated, service_role;
revoke all on public."website-clickup-job-links" from anon, authenticated, service_role;
revoke all on public."website-clickup-sync-outbox" from anon, authenticated, service_role;
grant select, insert, update, delete on public."website-clickup-integrations" to authenticated, service_role;
grant select, insert, update, delete on public."website-clickup-job-links" to authenticated, service_role;
grant select, insert, update, delete on public."website-clickup-sync-outbox" to authenticated, service_role;

insert into public."website-clickup-integrations" (
  workspace_id,
  target_client_id,
  list_id,
  list_name,
  status_mapping
)
select
  client.workspace_id,
  client.id,
  '1300350000002054',
  'APG/Amotiv',
  '{"planning":"TO DO","scheduled":"CONTENT CAPTURED","production":"EDITING","review":"APPROVAL","delivered":"COMPLETE"}'::jsonb
from public."website-clients" client
where client.workspace_id = '11111111-1111-4111-8111-111111111111'::uuid
  and lower(trim(client.name)) = 'autopacific group'
  and client.archived_at is null
order by client.created_at
limit 1
on conflict (workspace_id) do update set
  target_client_id = excluded.target_client_id,
  list_id = excluded.list_id,
  list_name = excluded.list_name,
  status_mapping = excluded.status_mapping;

comment on table public."website-clickup-integrations" is
  'Server-side ClickUp mirror configuration. API credentials live only in deployment secrets.';
comment on table public."website-clickup-job-links" is
  'Stable mapping between TruShot jobs and their mirrored ClickUp tasks.';
comment on table public."website-clickup-sync-outbox" is
  'Durable, retryable queue of CRM-to-ClickUp job changes.';
