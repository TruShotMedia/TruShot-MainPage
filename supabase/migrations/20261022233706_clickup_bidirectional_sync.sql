-- Safe bidirectional ClickUp syncing for AutoPacific jobs.
-- The existing CRM-to-ClickUp outbox remains intact. Incoming events are
-- authenticated, deduplicated, queued, and initially observed without writes.

alter table public."website-clickup-integrations"
  add column inbound_mode text not null default 'observe',
  add column import_new_tasks boolean not null default false,
  add column archive_on_remote_delete boolean not null default false,
  add column reconciliation_enabled boolean not null default true,
  add column webhook_id text,
  add column webhook_secret_ciphertext text,
  add column webhook_secret_iv text,
  add column webhook_secret_tag text,
  add column webhook_health text,
  add column webhook_fail_count integer not null default 0,
  add column last_webhook_received_at timestamptz,
  add column last_reconciled_at timestamptz,
  add constraint "website-clickup-integrations-inbound-mode-check"
    check (inbound_mode in ('paused', 'observe', 'active')),
  add constraint "website-clickup-integrations-webhook-fail-count-check"
    check (webhook_fail_count >= 0);

update public."website-clickup-integrations"
set list_name = 'Jobs'
where list_id = '1300350000002054';

alter table public."website-clickup-job-links"
  add column origin text not null default 'crm',
  add column last_shared_hash text,
  add column last_clickup_updated_at timestamptz,
  add column last_inbound_at timestamptz,
  add column sync_state text not null default 'linked',
  add constraint "website-clickup-job-links-origin-check"
    check (origin in ('crm', 'clickup')),
  add constraint "website-clickup-job-links-sync-state-check"
    check (sync_state in ('linked', 'paused', 'conflict'));

create table public."website-clickup-webhook-events" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  webhook_id text not null,
  dedupe_key text not null,
  clickup_task_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-webhook-events-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-webhook-events-dedupe-key" unique (dedupe_key),
  constraint "website-clickup-webhook-events-status-check"
    check (status in ('pending', 'processing', 'retry', 'completed', 'observed', 'ignored', 'conflict', 'failed')),
  constraint "website-clickup-webhook-events-attempts-check"
    check (attempts between 0 and 100)
);

create index "website-clickup-webhook-events-ready-idx"
  on public."website-clickup-webhook-events" (workspace_id, status, available_at, created_at)
  where status in ('pending', 'retry');

create index "website-clickup-webhook-events-task-idx"
  on public."website-clickup-webhook-events" (workspace_id, clickup_task_id, created_at desc);

create table public."website-clickup-conflicts" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  job_id uuid,
  clickup_task_id text not null,
  conflict_type text not null default 'concurrent_update',
  changed_fields text[] not null default '{}',
  crm_snapshot jsonb,
  clickup_snapshot jsonb,
  status text not null default 'open',
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-clickup-conflicts-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-conflicts-job-fkey"
    foreign key (job_id) references public."website-jobs" (id) on delete cascade,
  constraint "website-clickup-conflicts-status-check"
    check (status in ('open', 'resolved', 'dismissed')),
  constraint "website-clickup-conflicts-resolution-check"
    check (resolution is null or resolution in ('crm', 'clickup', 'dismissed'))
);

create unique index "website-clickup-conflicts-open-task-key"
  on public."website-clickup-conflicts" (workspace_id, clickup_task_id)
  where status = 'open';

create index "website-clickup-conflicts-workspace-created-idx"
  on public."website-clickup-conflicts" (workspace_id, created_at desc);

create index "website-clickup-conflicts-job-idx"
  on public."website-clickup-conflicts" (job_id)
  where job_id is not null;

create table public."website-clickup-sync-audit" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  direction text not null,
  action text not null,
  outcome text not null,
  job_id uuid,
  clickup_task_id text,
  detail text,
  created_at timestamptz not null default now(),
  constraint "website-clickup-sync-audit-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clickup-sync-audit-direction-check"
    check (direction in ('inbound', 'outbound', 'system')),
  constraint "website-clickup-sync-audit-outcome-check"
    check (outcome in ('completed', 'observed', 'ignored', 'conflict', 'failed'))
);

create index "website-clickup-sync-audit-workspace-created-idx"
  on public."website-clickup-sync-audit" (workspace_id, created_at desc);

create index "website-clickup-sync-audit-job-idx"
  on public."website-clickup-sync-audit" (job_id)
  where job_id is not null;

create trigger "website-clickup-webhook-events-updated-at"
before update on public."website-clickup-webhook-events"
for each row execute function "website-private"."website-set-updated-at"();

create trigger "website-clickup-conflicts-updated-at"
before update on public."website-clickup-conflicts"
for each row execute function "website-private"."website-set-updated-at"();

alter table public."website-clickup-webhook-events" enable row level security;
alter table public."website-clickup-conflicts" enable row level security;
alter table public."website-clickup-sync-audit" enable row level security;

create policy "website-clickup-webhook-events-admin-all"
on public."website-clickup-webhook-events"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-clickup-conflicts-admin-all"
on public."website-clickup-conflicts"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-clickup-sync-audit-admin-all"
on public."website-clickup-sync-audit"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

revoke all on public."website-clickup-webhook-events" from anon, authenticated, service_role;
revoke all on public."website-clickup-conflicts" from anon, authenticated, service_role;
revoke all on public."website-clickup-sync-audit" from anon, authenticated, service_role;

grant select, insert, update, delete on public."website-clickup-webhook-events" to authenticated, service_role;
grant select, insert, update, delete on public."website-clickup-conflicts" to authenticated, service_role;
grant select, insert, update, delete on public."website-clickup-sync-audit" to authenticated, service_role;

comment on column public."website-clickup-integrations".inbound_mode is
  'paused discards incoming events, observe records them without CRM writes, active applies safe shared-field changes.';
comment on table public."website-clickup-webhook-events" is
  'Authenticated and idempotent inbox for ClickUp webhook deliveries.';
comment on table public."website-clickup-conflicts" is
  'Human-review queue used when both systems changed from their last shared state.';
comment on table public."website-clickup-sync-audit" is
  'Sanitised operational history for ClickUp sync decisions and failures.';
