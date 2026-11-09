-- Structured locations stay on the job and inherit its existing RLS policies.
alter table public."website-jobs"
  add column location_details jsonb,
  add column location_original text;

create function public."website-job-location-normalize"()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.location := nullif(btrim(new.location), '');
  if tg_op = 'UPDATE' then
    new.location_original := old.location_original;
    if new.location is distinct from old.location then
      new.location_original := coalesce(old.location_original, old.location);
      -- Older forms, imports and ClickUp can still write text only. Never keep a stale pin.
      if new.location_details is not distinct from old.location_details then
        new.location_details := null;
      end if;
    end if;
  end if;
  if new.location is null then new.location_details := null; end if;
  if new.location_details is not null then
    if jsonb_typeof(new.location_details) <> 'object'
       or octet_length(new.location_details::text) > 5000
       or new.location_details->>'version' is distinct from '1'
       or new.location_details->>'label' is distinct from new.location
       or jsonb_typeof(new.location_details->'latitude') is distinct from 'number'
       or jsonb_typeof(new.location_details->'longitude') is distinct from 'number'
       or coalesce(new.location_details->>'provider','') not in ('manual','geoapify')
       or coalesce(new.location_details->>'precision','') not in ('address','place','street','city','region','manual')
       or jsonb_typeof(new.location_details->'attribution') is distinct from 'string'
    then raise exception 'Choose the location again before saving.' using errcode = '22023'; end if;
    if (new.location_details->>'latitude')::numeric not between -90 and 90
       or (new.location_details->>'longitude')::numeric not between -180 and 180
    then raise exception 'Location coordinates are out of range.' using errcode = '22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public."website-job-location-normalize"() from public, anon, authenticated;
create trigger website_job_location_normalize before insert or update of location, location_details, location_original
  on public."website-jobs" for each row execute function public."website-job-location-normalize"();

-- Only exact, unambiguous aliases, and only AutoPacific jobs. City-level, never an invented venue.
update public."website-jobs" j set
  location_original = coalesce(j.location_original,j.location),
  location = 'Melbourne, Victoria, Australia',
  location_details = jsonb_build_object('version',1,'label','Melbourne, Victoria, Australia',
    'latitude',-37.8136,'longitude',144.9631,'precision','city','provider','manual',
    'city','Melbourne','country','Australia','attribution','City-level reference · approximate location')
where j.client_id in (select id from public."website-clients" where lower(btrim(name)) = 'autopacific group')
  and lower(btrim(j.location)) in ('mel','melbourne') and j.location_details is null;

-- Server-only budget. No browser access, no provider secrets stored in the database.
create table public."website-map-search-budget" (
  workspace_id uuid not null,
  bucket text not null,
  used integer not null check (used > 0),
  expires_at timestamptz not null,
  primary key (workspace_id,bucket)
);
create index website_map_search_budget_expiry on public."website-map-search-budget"(expires_at);
alter table public."website-map-search-budget" enable row level security;
create policy website_map_search_budget_service on public."website-map-search-budget" for all to service_role using (true) with check (true);
revoke all on public."website-map-search-budget" from public, anon, authenticated;
grant select, insert, update, delete on public."website-map-search-budget" to service_role;

create function public."website-map-search-allow"(p_workspace_id uuid,p_user_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  stamp timestamptz := clock_timestamp();
  keys text[];
  limits integer[] := array[2500,40,3];
  expiries timestamptz[];
  i integer;
begin
  if p_workspace_id is null or p_user_id is null then return false; end if;
  -- Serialize only location-search budget updates for this workspace (not jobs or other queries).
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':map-search',0));
  delete from public."website-map-search-budget" where workspace_id=p_workspace_id and expires_at < stamp;
  keys := array['day:'||to_char(stamp at time zone 'UTC','YYYYMMDD'),
    'user:'||p_user_id::text||':'||to_char(stamp at time zone 'UTC','YYYYMMDDHH24MI'),
    'second:'||to_char(stamp at time zone 'UTC','YYYYMMDDHH24MISS')];
  expiries := array[date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC' + interval '1 day',stamp+interval '2 minutes',stamp+interval '2 seconds'];
  for i in 1..3 loop
    if exists(select 1 from public."website-map-search-budget" where workspace_id=p_workspace_id and bucket=keys[i] and used>=limits[i]) then return false; end if;
  end loop;
  for i in 1..3 loop
    insert into public."website-map-search-budget" as budget values(p_workspace_id,keys[i],1,expiries[i])
      on conflict(workspace_id,bucket) do update set used=budget.used+1;
  end loop;
  return true;
end $$;
revoke all on function public."website-map-search-allow"(uuid,uuid) from public, anon, authenticated;
grant execute on function public."website-map-search-allow"(uuid,uuid) to service_role;

-- Preserve the existing atomic campaign save and all its RLS/concurrency checks.
CREATE OR REPLACE FUNCTION public."website-save-campaign-plan"(p_workspace_id uuid, p_client_id uuid, p_plan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_campaign_id uuid := (p_plan->>'id')::uuid;
  existing public."website-campaigns"%rowtype;
  existing_job public."website-jobs"%rowtype;
  week jsonb; job jsonb; week_id uuid; job_id uuid; stage_key text;
  week_ids uuid[] := '{}'; job_ids uuid[] := '{}'; week_position integer := 0;
  job_count integer := 0; initial_date date := (p_plan->>'start_date')::date;
begin
  if (select auth.uid()) is null then raise exception 'Sign in before saving a campaign.'; end if;
  if not ((select "website-private"."website-has-workspace-access"(p_workspace_id))
    or p_client_id=(select "website-private"."website-autopacific-client-id"(p_workspace_id))) then
    raise exception 'This campaign workspace is not available.';
  end if;
  if not exists (select 1 from public."website-clients" where id=p_client_id and workspace_id=p_workspace_id and archived_at is null)
    or initial_date is null or char_length(btrim(p_plan->>'title')) not between 2 and 180
    or jsonb_typeof(p_plan->'weeks') is distinct from 'array'
    or jsonb_array_length(p_plan->'weeks') not between 1 and 52 then raise exception 'Check the campaign title, first date and weeks.'; end if;

  select * into existing from public."website-campaigns" where id=v_campaign_id for update;
  if found then
    if existing.workspace_id<>p_workspace_id or existing.client_id is distinct from p_client_id
      or not existing.is_weekly_plan or existing.archived_at is not null then raise exception 'Campaign unavailable.'; end if;
    if existing.updated_at is distinct from (p_plan->>'updated_at')::timestamptz then
      raise exception 'This campaign changed elsewhere. Close and reopen it before saving.';
    end if;
  elsif p_plan->>'updated_at' is not null then raise exception 'Campaign unavailable.';
  end if;

  -- Serialize changes to linked jobs in a consistent order.
  perform j.id from public."website-jobs" j join public."website-campaign-weeks" w on w.id=j.campaign_week_id
    where w.campaign_id=v_campaign_id order by j.id for update of j;
  insert into public."website-campaigns"(id,workspace_id,client_id,title,objective,notes,start_date,due_date,is_weekly_plan,assignee_ids,created_by,updated_by)
  values(v_campaign_id,p_workspace_id,p_client_id,btrim(p_plan->>'title'),nullif(p_plan->>'objective',''),nullif(p_plan->>'notes',''),
    initial_date,initial_date+(jsonb_array_length(p_plan->'weeks')*7-1),true,array(select value::uuid from jsonb_array_elements_text(coalesce(p_plan->'assignee_ids','[]'))),auth.uid(),auth.uid())
  on conflict(id) do update set title=excluded.title,objective=excluded.objective,notes=excluded.notes,
    start_date=excluded.start_date,due_date=excluded.due_date,assignee_ids=case when p_plan ? 'assignee_ids' then excluded.assignee_ids else "website-campaigns".assignee_ids end,updated_by=auth.uid();

  for week in select value from jsonb_array_elements(p_plan->'weeks') loop
    week_id := (week->>'id')::uuid;
    if week_id is null or week_id=any(week_ids) or jsonb_typeof(week->'jobs') is distinct from 'array'
      or jsonb_array_length(week->'jobs') not between 1 and 20 then raise exception 'Each week needs at least one job and a unique identifier.'; end if;
    week_ids:=array_append(week_ids,week_id);
    if exists(select 1 from public."website-campaign-weeks" w where w.id=week_id and w.campaign_id<>v_campaign_id) then raise exception 'Week belongs to another campaign.'; end if;
    insert into public."website-campaign-weeks"(id,workspace_id,campaign_id,title,position)
    values(week_id,p_workspace_id,v_campaign_id,coalesce(week->>'title',''),week_position)
    on conflict(id) do update set title=excluded.title,position=excluded.position;
    for job in select value from jsonb_array_elements(week->'jobs') loop
      job_id := (job->>'id')::uuid;
      job_count := job_count+1;
      if job_id is null or job_id=any(job_ids) or job_count>300 then raise exception 'Each job needs a unique identifier; use up to 300 jobs per campaign.'; end if;
      job_ids:=array_append(job_ids,job_id);
      select s.key into stage_key from public."website-job-statuses" s
        where s.id=(job->>'status_id')::uuid and s.workspace_id=p_workspace_id and s.is_active;
      if stage_key is null then raise exception 'Choose an available job status.'; end if;
      select * into existing_job from public."website-jobs" j where j.id=job_id for update;
      if found then
        if existing_job.workspace_id<>p_workspace_id or existing_job.client_id is distinct from p_client_id
          or existing_job.archived_at is not null or not exists(select 1 from public."website-campaign-weeks" w where w.id=existing_job.campaign_week_id and w.campaign_id=v_campaign_id)
          then raise exception 'A job belongs to a different campaign or is no longer available.'; end if;
        if existing_job.updated_at is distinct from (job->>'updated_at')::timestamptz then
          raise exception 'A job changed elsewhere. Close and reopen the campaign before saving.';
        end if;
        -- Only fields present in this editor change: notes, attachments, invoices,
        -- shoot times, history and all other operational fields remain untouched.
        update public."website-jobs" j set title=btrim(job->>'title'),status_id=(job->>'status_id')::uuid,
          shoot_date=(job->>'shoot_date')::date,due_date=(job->>'due_date')::date,
          description=nullif(job->>'description',''),location=nullif(job->>'location',''),
          location_details=case when job ? 'location_details' then nullif(job->'location_details','null'::jsonb) else j.location_details end,
          deliverables=job->'deliverables',campaign_week_id=week_id,assignee_ids=case when job ? 'assignee_ids' then array(select value::uuid from jsonb_array_elements_text(job->'assignee_ids')) else j.assignee_ids end,updated_by=auth.uid()
        where j.id=job_id;
      else
        if job->>'updated_at' is not null then raise exception 'Job unavailable.'; end if;
        insert into public."website-jobs"(id,workspace_id,client_id,status_id,title,shoot_date,due_date,description,location,location_details,deliverables,campaign_week_id,assignee_ids,created_by,updated_by)
        values(job_id,p_workspace_id,p_client_id,(job->>'status_id')::uuid,btrim(job->>'title'),
          (job->>'shoot_date')::date,(job->>'due_date')::date,nullif(job->>'description',''),nullif(job->>'location',''),nullif(job->'location_details','null'::jsonb),job->'deliverables',week_id,array(select value::uuid from jsonb_array_elements_text(coalesce(job->'assignee_ids',p_plan->'assignee_ids','[]'))),auth.uid(),auth.uid());
      end if;
    end loop;
    week_position:=week_position+1;
  end loop;
  -- Removing a week/job only removes its campaign relation, not the work itself.
  update public."website-jobs" j set campaign_week_id=null,updated_by=auth.uid()
    from public."website-campaign-weeks" w where w.id=j.campaign_week_id and w.campaign_id=v_campaign_id
      and not(j.id=any(job_ids)) and j.archived_at is null;
  -- Retain delayed originals alongside their successors rather than detaching history.
  delete from public."website-campaign-weeks" w where w.campaign_id=v_campaign_id and not(w.id=any(week_ids));
  return v_campaign_id;
end $function$;
