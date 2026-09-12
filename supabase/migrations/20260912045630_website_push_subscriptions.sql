-- Native Web Push subscriptions for installed TruShot admin devices.
create table public."website-push-subscriptions" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  expiration_time bigint,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-push-subscriptions-workspace-fkey"
    foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-push-subscriptions-user-fkey"
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint "website-push-subscriptions-endpoint-key" unique (endpoint),
  constraint "website-push-subscriptions-endpoint-check"
    check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  constraint "website-push-subscriptions-p256dh-check"
    check (char_length(p256dh) between 20 and 255),
  constraint "website-push-subscriptions-auth-key-check"
    check (char_length(auth_key) between 10 and 255),
  constraint "website-push-subscriptions-user-agent-check"
    check (user_agent is null or char_length(user_agent) <= 500)
);

create index "website-push-subscriptions-workspace-user-idx"
  on public."website-push-subscriptions" (workspace_id, user_id);

alter table public."website-push-subscriptions" enable row level security;

create policy "website-push-subscriptions-own-select"
on public."website-push-subscriptions"
for select to authenticated
using (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-workspace-access"(workspace_id))
);

create policy "website-push-subscriptions-own-insert"
on public."website-push-subscriptions"
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-workspace-access"(workspace_id))
);

create policy "website-push-subscriptions-own-update"
on public."website-push-subscriptions"
for update to authenticated
using (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-workspace-access"(workspace_id))
)
with check (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-workspace-access"(workspace_id))
);

create policy "website-push-subscriptions-own-delete"
on public."website-push-subscriptions"
for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select "website-private"."website-has-workspace-access"(workspace_id))
);

create trigger "website-push-subscriptions-updated-at"
before update on public."website-push-subscriptions"
for each row execute function "website-private"."website-set-updated-at"();

revoke all on public."website-push-subscriptions" from anon, authenticated;
grant select, insert, update, delete on public."website-push-subscriptions" to authenticated;
grant select, delete on public."website-push-subscriptions" to service_role;
