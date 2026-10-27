-- Keep the legacy text list for older clients while adding stable, dated items.
alter table public."website-jobs" add column deliverables jsonb not null default '[]';
alter table public."website-job-tasks"
  add column source_deliverable_id uuid,
  add column due_date_is_override boolean not null default false;
create unique index "website-job-tasks-deliverable-once-idx"
  on public."website-job-tasks"(job_id, source_deliverable_id) where source_deliverable_id is not null;

create function "website-private"."website-valid-deliverables"(items jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; identifiers uuid[] := '{}'; identifier uuid;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 30 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'name') <> 'string'
      or char_length(btrim(item->>'name')) not between 1 and 300 then return false; end if;
    identifier := (item->>'id')::uuid;
    if identifier is null or identifier = any(identifiers) then return false; end if;
    identifiers := array_append(identifiers, identifier);
    if item->>'date' is not null then
      if item->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      perform (item->>'date')::date;
    end if;
  end loop;
  return true;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end $$;
revoke all on function "website-private"."website-valid-deliverables"(jsonb) from public, anon;
grant execute on function "website-private"."website-valid-deliverables"(jsonb) to authenticated, service_role;
alter table public."website-jobs" add constraint "website-jobs-dated-deliverables-check"
  check ("website-private"."website-valid-deliverables"(deliverables));

update public."website-jobs" job set deliverables = coalesce((
  select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'name', name, 'date', null) order by position)
  from unnest(job.key_deliverables) with ordinality as legacy(name, position)
), '[]'::jsonb) where cardinality(key_deliverables) > 0;

create function "website-private"."website-mirror-deliverables"()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare use_legacy boolean;
begin
  if tg_op = 'INSERT' then
    use_legacy := new.deliverables = '[]'::jsonb and cardinality(new.key_deliverables) > 0;
  else
    use_legacy := new.deliverables = old.deliverables and new.key_deliverables is distinct from old.key_deliverables;
  end if;
  if use_legacy then
    new.deliverables := coalesce((select jsonb_agg(jsonb_build_object(
      'id', coalesce((select item->>'id' from jsonb_array_elements(new.deliverables) item where item->>'name' = name limit 1), gen_random_uuid()::text),
      'name', name,
      'date', (select item->>'date' from jsonb_array_elements(new.deliverables) item where item->>'name' = name limit 1)
    ) order by position) from unnest(new.key_deliverables) with ordinality as legacy(name, position)), '[]'::jsonb);
  else
    new.key_deliverables := array(select item->>'name' from jsonb_array_elements(new.deliverables) item);
  end if;
  return new;
end $$;
revoke all on function "website-private"."website-mirror-deliverables"() from public, anon, authenticated, service_role;
create trigger "website-jobs-mirror-deliverables" before insert or update of deliverables, key_deliverables on public."website-jobs"
  for each row execute function "website-private"."website-mirror-deliverables"();

-- SECURITY INVOKER: the existing client-scoped RLS authorizes both the job and
-- inserted tasks. A row lock plus unique index makes repeats/concurrent clicks safe.
create function public."website-create-deliverable-tasks"(p_job_id uuid)
returns table(created_count integer, existing_count integer)
language plpgsql security invoker set search_path = '' as $$
declare job record; item jsonb; task_status uuid; next_position numeric; inserted integer;
begin
  if (select auth.uid()) is null then raise exception 'Sign in before creating tasks.'; end if;
  select j.* into job from public."website-jobs" j where j.id = p_job_id and j.archived_at is null for update;
  if not found then raise exception 'That job is unavailable.'; end if;
  if exists (select 1 from public."website-job-statuses" s where s.id = job.status_id and s.is_closed) then
    raise exception 'Open an active job to create deliverable tasks.';
  end if;
  select id into task_status from public."website-task-statuses" where workspace_id = job.workspace_id and key = 'not_started' and is_active and is_open;
  if task_status is null then raise exception 'Not Started status is unavailable.'; end if;
  select coalesce(max(position), 0) + 1000 into next_position from public."website-job-tasks"
    where workspace_id = job.workspace_id and status_id = task_status and archived_at is null;
  created_count := 0; existing_count := 0;
  for item in select value from jsonb_array_elements(job.deliverables) loop
    insert into public."website-job-tasks"(workspace_id, job_id, status_id, title, description, asset_type, priority,
      due_date, due_date_is_override, source_deliverable_id, position, created_by, updated_by)
    values (job.workspace_id, job.id, task_status, left(item->>'name', 220),
      case when char_length(item->>'name') > 220 then item->>'name' end, 'Asset', 'normal',
      coalesce((item->>'date')::date, job.due_date), item->>'date' is not null, (item->>'id')::uuid,
      next_position, auth.uid(), auth.uid())
    on conflict (job_id, source_deliverable_id) where source_deliverable_id is not null do nothing;
    get diagnostics inserted = row_count;
    created_count := created_count + inserted;
    existing_count := existing_count + (1 - inserted);
    next_position := next_position + 1000;
  end loop;
  return next;
end $$;
revoke all on function public."website-create-deliverable-tasks"(uuid) from public, anon;
grant execute on function public."website-create-deliverable-tasks"(uuid) to authenticated;

-- Rescheduled jobs retain the complete brief, not just its legacy names.
-- A delayed task keeps its explicitly rescheduled date when edited later.
do $$ declare definition text; begin
  definition := pg_get_functiondef('public."website-delay-job"(uuid,date,text)'::regprocedure);
  if position('delivery_url, key_deliverables, created_by' in definition) = 0 then raise exception 'Unexpected job delay definition'; end if;
  definition := replace(definition, 'delivery_url, key_deliverables, created_by', 'delivery_url, key_deliverables, deliverables, created_by');
  definition := replace(definition, 'v_source.delivery_url, v_source.key_deliverables, auth.uid()', 'v_source.delivery_url, v_source.key_deliverables, v_source.deliverables, auth.uid()');
  execute definition;
  definition := pg_get_functiondef('public."website-delay-task"(uuid,date,text)'::regprocedure);
  if position('v_source.external_url, auth.uid(), auth.uid()' in definition) = 0 then raise exception 'Unexpected task delay definition'; end if;
  definition := replace(definition, 'created_by, updated_by', 'due_date_is_override, created_by, updated_by');
  definition := replace(definition, 'v_source.external_url, auth.uid(), auth.uid()', 'v_source.external_url, true, auth.uid(), auth.uid()');
  execute definition;
end $$;
update public."website-job-tasks" task set due_date_is_override = true
where exists (select 1 from public."website-task-delay-history" history where history.successor_task_id = task.id);

create function "website-private"."website-sync-deliverable-dates"()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public."website-job-tasks" task
    set due_date = coalesce((item->>'date')::date, new.due_date),
        due_date_is_override = item->>'date' is not null,
        updated_by = new.updated_by
  from jsonb_array_elements(new.deliverables) item
  where task.job_id = new.id and task.workspace_id = new.workspace_id
    and task.source_deliverable_id = (item->>'id')::uuid and task.archived_at is null
    and exists (select 1 from public."website-task-statuses" status where status.id = task.status_id and status.is_open)
    and (task.due_date is distinct from coalesce((item->>'date')::date, new.due_date)
      or task.due_date_is_override is distinct from (item->>'date' is not null));
  return new;
end $$;
revoke all on function "website-private"."website-sync-deliverable-dates"() from public, anon, authenticated, service_role;
create trigger "website-jobs-sync-deliverable-dates" after update of deliverables, due_date on public."website-jobs"
  for each row execute function "website-private"."website-sync-deliverable-dates"();
