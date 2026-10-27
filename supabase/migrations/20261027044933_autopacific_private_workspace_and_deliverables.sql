-- Portal membership, not CRM admin membership: no finance, settings or other clients.
insert into public."website-portal-users" (workspace_id, user_id, portal_key, display_name)
select '11111111-1111-4111-8111-111111111111', id, 'autopacific', 'John'
from auth.users where lower(email) = 'jherholdt@autopac.com.au'
on conflict (workspace_id, user_id, portal_key) do update set is_active = true;

create or replace function "website-private"."website-autopacific-client-id"(requested_workspace_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select client.id from public."website-clients" client
  where client.workspace_id = requested_workspace_id
    and lower(client.name) = 'autopacific group' and client.archived_at is null
    and (select auth.uid()) is not null
    and (select "website-private"."website-has-portal-access"(requested_workspace_id, 'autopacific'))
  limit 1;
$$;

create or replace function "website-private"."website-can-access-production-job"(requested_workspace_id uuid, requested_job_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public."website-jobs" job
    where job.workspace_id = requested_workspace_id and job.id = requested_job_id
      and ((select "website-private"."website-has-workspace-access"(requested_workspace_id))
        or job.client_id = (select "website-private"."website-autopacific-client-id"(requested_workspace_id)))
  );
$$;

create or replace function "website-private"."website-can-access-production-task"(requested_workspace_id uuid, requested_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public."website-job-tasks" task
    where task.workspace_id = requested_workspace_id and task.id = requested_task_id
      and (select "website-private"."website-can-access-production-job"(requested_workspace_id, task.job_id))
  );
$$;

revoke all on function "website-private"."website-autopacific-client-id"(uuid) from public, anon;
revoke all on function "website-private"."website-can-access-production-job"(uuid, uuid) from public, anon;
revoke all on function "website-private"."website-can-access-production-task"(uuid, uuid) from public, anon;
grant execute on function "website-private"."website-autopacific-client-id"(uuid),
  "website-private"."website-can-access-production-job"(uuid, uuid),
  "website-private"."website-can-access-production-task"(uuid, uuid) to authenticated;

create policy "autopacific-client-read" on public."website-clients" for select to authenticated
using (id = (select "website-private"."website-autopacific-client-id"(workspace_id)));

create policy "autopacific-jobs" on public."website-jobs" for all to authenticated
using (client_id = (select "website-private"."website-autopacific-client-id"(workspace_id)))
with check (client_id = (select "website-private"."website-autopacific-client-id"(workspace_id)));

create policy "autopacific-tasks" on public."website-job-tasks" for all to authenticated
using ((select "website-private"."website-can-access-production-job"(workspace_id, job_id)))
with check ((select "website-private"."website-can-access-production-job"(workspace_id, job_id)));

create policy "autopacific-events" on public."website-calendar-events" for all to authenticated
using (client_id = (select "website-private"."website-autopacific-client-id"(workspace_id)))
with check (client_id = (select "website-private"."website-autopacific-client-id"(workspace_id)));

create policy "autopacific-flights" on public."website-flight-events" for all to authenticated
using (client_id = (select "website-private"."website-autopacific-client-id"(workspace_id)))
with check (client_id = (select "website-private"."website-autopacific-client-id"(workspace_id)));

create policy "autopacific-notes" on public."website-work-record-notes" for all to authenticated
using ((record_kind = 'job' and (select "website-private"."website-can-access-production-job"(workspace_id, job_id)))
  or (record_kind = 'task' and (select "website-private"."website-can-access-production-task"(workspace_id, task_id))))
with check ((record_kind = 'job' and (select "website-private"."website-can-access-production-job"(workspace_id, job_id)))
  or (record_kind = 'task' and (select "website-private"."website-can-access-production-task"(workspace_id, task_id))));

create policy "autopacific-job-history-read" on public."website-job-delay-history" for select to authenticated
using ((select "website-private"."website-can-access-production-job"(workspace_id, source_job_id)));
create policy "autopacific-task-history-read" on public."website-task-delay-history" for select to authenticated
using ((select "website-private"."website-can-access-production-task"(workspace_id, source_task_id)));

create policy "autopacific-job-status-read" on public."website-job-statuses" for select to authenticated
using ((select "website-private"."website-autopacific-client-id"(workspace_id)) is not null);
create policy "autopacific-task-status-read" on public."website-task-statuses" for select to authenticated
using ((select "website-private"."website-autopacific-client-id"(workspace_id)) is not null);
create policy "autopacific-weather-read" on public."website-weather-snapshots" for select to authenticated
using ((select "website-private"."website-autopacific-client-id"(workspace_id)) is not null);

create policy "autopacific-campaign-read" on public."website-campaigns" for select to authenticated
using (client_id = (select "website-private"."website-autopacific-client-id"(workspace_id)));
create policy "autopacific-campaign-asset-read" on public."website-campaign-assets" for select to authenticated
using (exists (select 1 from public."website-campaigns" campaign where campaign.id = campaign_id
  and campaign.workspace_id = "website-campaign-assets".workspace_id
  and campaign.client_id = (select "website-private"."website-autopacific-client-id"("website-campaign-assets".workspace_id))));

-- Optional structured deliverables. Existing photo counts stay unchanged.
alter table public."website-jobs" add column key_deliverables text[] not null default '{}';
alter table public."website-jobs" add constraint "website-jobs-deliverables-check"
  check (cardinality(key_deliverables) <= 30 and array_to_string(key_deliverables, E'\n') is not null
    and char_length(array_to_string(key_deliverables, E'\n')) <= 10000);

-- Preserve note history on every successor, then add the reason to both ends.
-- Stable origin keys make backfilling/retries idempotent, not text-based guesses.
alter table public."website-work-record-notes" add column origin_key text, add column rescheduled_date date;
create unique index "website-work-record-notes-job-origin-idx"
  on public."website-work-record-notes" (workspace_id, job_id, origin_key) where job_id is not null and origin_key is not null;
create unique index "website-work-record-notes-task-origin-idx"
  on public."website-work-record-notes" (workspace_id, task_id, origin_key) where task_id is not null and origin_key is not null;

create or replace function "website-private"."website-preserve-reschedule-notes"(
  p_kind text, p_workspace uuid, p_source uuid, p_successor uuid, p_history uuid,
  p_reason text, p_date date, p_author uuid, p_created_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind = 'job' then
    insert into public."website-work-record-notes" (workspace_id, record_kind, job_id, body, created_by, updated_by, created_at, updated_at, origin_key)
    select job.workspace_id, 'job', job.id, btrim(job.notes), job.created_by, job.updated_by, job.created_at, job.updated_at, 'legacy:' || job.id
    from public."website-jobs" job where job.id = p_source and job.workspace_id = p_workspace
      and nullif(btrim(job.notes), '') is not null
      and not exists (select 1 from public."website-work-record-notes" note where note.job_id = job.id and note.body = btrim(job.notes))
    on conflict do nothing;
  end if;

  insert into public."website-work-record-notes" (workspace_id, record_kind, job_id, task_id, body, created_by, updated_by, created_at, updated_at, origin_key, rescheduled_date)
  select p_workspace, p_kind,
    case when p_kind = 'job' then p_successor end, case when p_kind = 'task' then p_successor end,
    note.body, note.created_by, note.updated_by, note.created_at, note.updated_at,
    coalesce(note.origin_key, 'copy:' || note.id), note.rescheduled_date
  from public."website-work-record-notes" note
  where note.workspace_id = p_workspace and note.record_kind = p_kind
    and (case when p_kind = 'job' then note.job_id else note.task_id end) = p_source
    and coalesce(note.origin_key, '') <> 'reschedule:' || p_history
  on conflict do nothing;

  insert into public."website-work-record-notes" (workspace_id, record_kind, job_id, task_id, body, created_by, updated_by, created_at, updated_at, origin_key, rescheduled_date)
  select p_workspace, p_kind,
    case when p_kind = 'job' then record_id end, case when p_kind = 'task' then record_id end,
    p_reason, p_author, p_author, p_created_at, p_created_at, 'reschedule:' || p_history, p_date
  from unnest(array[p_source, p_successor]) as record_id
  on conflict do nothing;
end;
$$;
revoke all on function "website-private"."website-preserve-reschedule-notes"(text,uuid,uuid,uuid,uuid,text,date,uuid,timestamptz) from public, anon, authenticated, service_role;

create or replace function "website-private"."website-reschedule-notes-trigger"()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'website-job-delay-history' then
    perform "website-private"."website-preserve-reschedule-notes"('job', new.workspace_id, new.source_job_id, new.successor_job_id, new.id, new.reason, new.rescheduled_shoot_date, new.created_by, new.created_at);
  else
    perform "website-private"."website-preserve-reschedule-notes"('task', new.workspace_id, new.source_task_id, new.successor_task_id, new.id, new.reason, new.rescheduled_due_date, new.created_by, new.created_at);
  end if;
  return new;
end;
$$;
revoke all on function "website-private"."website-reschedule-notes-trigger"() from public, anon, authenticated, service_role;
create trigger "website-job-delay-history-notes" after insert on public."website-job-delay-history"
  for each row execute function "website-private"."website-reschedule-notes-trigger"();
create trigger "website-task-delay-history-notes" after insert on public."website-task-delay-history"
  for each row execute function "website-private"."website-reschedule-notes-trigger"();

do $$ declare history record; begin
  for history in select * from public."website-job-delay-history" order by created_at loop
    perform "website-private"."website-preserve-reschedule-notes"('job', history.workspace_id, history.source_job_id, history.successor_job_id, history.id, history.reason, history.rescheduled_shoot_date, history.created_by, history.created_at);
  end loop;
  for history in select * from public."website-task-delay-history" order by created_at loop
    perform "website-private"."website-preserve-reschedule-notes"('task', history.workspace_id, history.source_task_id, history.successor_task_id, history.id, history.reason, history.rescheduled_due_date, history.created_by, history.created_at);
  end loop;
end $$;

-- Keep the tested atomic delay routines; change only access checks and the
-- newly added copied field, asserting the expected definition before replacing.
do $$ declare definition text; begin
  definition := pg_get_functiondef('public."website-delay-job"(uuid,date,text)'::regprocedure);
  if position('"website-has-workspace-access"(v_source.workspace_id)' in definition) = 0 then raise exception 'Unexpected job delay definition'; end if;
  definition := replace(definition, '"website-has-workspace-access"(v_source.workspace_id)', '"website-can-access-production-job"(v_source.workspace_id, v_source.id)');
  definition := replace(definition, 'package_snapshot, notes, delivery_url, created_by, updated_by', 'package_snapshot, notes, delivery_url, key_deliverables, created_by, updated_by');
  definition := replace(definition, 'v_source.delivery_url, auth.uid(), auth.uid()', 'v_source.delivery_url, v_source.key_deliverables, auth.uid(), auth.uid()');
  execute definition;
  definition := pg_get_functiondef('public."website-delay-task"(uuid,date,text)'::regprocedure);
  if position('"website-has-workspace-access"(v_source.workspace_id)' in definition) = 0 then raise exception 'Unexpected task delay definition'; end if;
  definition := replace(definition, '"website-has-workspace-access"(v_source.workspace_id)', '"website-can-access-production-task"(v_source.workspace_id, v_source.id)');
  execute definition;
end $$;

-- Device subscriptions carry a server-enforced client scope. Background sends
-- must not disclose CRM requests or unrelated calendar records to portal users.
alter table public."website-push-subscriptions" add column client_scope_id uuid references public."website-clients"(id);
create index "website-push-subscriptions-client-scope-idx" on public."website-push-subscriptions"(client_scope_id);
create policy "autopacific-push-own" on public."website-push-subscriptions" for all to authenticated
using (user_id = (select auth.uid()) and client_scope_id = (select "website-private"."website-autopacific-client-id"(workspace_id)))
with check (user_id = (select auth.uid()) and client_scope_id = (select "website-private"."website-autopacific-client-id"(workspace_id)));
