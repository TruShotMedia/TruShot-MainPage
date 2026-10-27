-- Weekly campaigns use the existing jobs/tasks, never a shadow copy.
alter table public."website-campaigns" add column is_weekly_plan boolean not null default false;
create table public."website-campaign-weeks" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public."website-workspaces"(id) on delete cascade,
  campaign_id uuid not null references public."website-campaigns"(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 180),
  position integer not null check (position between 0 and 51),
  unique(campaign_id, position) deferrable initially deferred
);
create index "website-campaign-weeks-workspace-idx" on public."website-campaign-weeks"(workspace_id);
alter table public."website-jobs" add column campaign_week_id uuid references public."website-campaign-weeks"(id) on delete set null;
create index "website-jobs-campaign-week-idx" on public."website-jobs"(campaign_week_id) where campaign_week_id is not null;

alter table public."website-campaign-weeks" enable row level security;
create policy "website-campaign-weeks-production" on public."website-campaign-weeks" for all to authenticated
using (exists (select 1 from public."website-campaigns" c where c.id=campaign_id and c.workspace_id="website-campaign-weeks".workspace_id and c.is_weekly_plan))
with check (exists (select 1 from public."website-campaigns" c where c.id=campaign_id and c.workspace_id="website-campaign-weeks".workspace_id and c.is_weekly_plan));
revoke all on public."website-campaign-weeks" from anon, authenticated;
grant select, insert, update, delete on public."website-campaign-weeks" to authenticated;

create policy "website-campaigns-portal-plan-insert" on public."website-campaigns" for insert to authenticated
with check (is_weekly_plan and client_id=(select "website-private"."website-autopacific-client-id"(workspace_id)));
create policy "website-campaigns-portal-plan-update" on public."website-campaigns" for update to authenticated
using (is_weekly_plan and client_id=(select "website-private"."website-autopacific-client-id"(workspace_id)))
with check (is_weekly_plan and client_id=(select "website-private"."website-autopacific-client-id"(workspace_id)));

create function "website-private"."website-guard-campaign-job"()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.campaign_week_id is not null and not exists (
    select 1 from public."website-campaign-weeks" w join public."website-campaigns" c on c.id=w.campaign_id
    where w.id=new.campaign_week_id and w.workspace_id=new.workspace_id
      and c.workspace_id=new.workspace_id and c.client_id=new.client_id and c.is_weekly_plan
  ) then raise exception 'The campaign and job must belong to the same client and workspace.'; end if;
  return new;
end $$;
revoke all on function "website-private"."website-guard-campaign-job"() from public, anon, authenticated, service_role;
create trigger "website-jobs-campaign-scope" before insert or update of campaign_week_id,client_id,workspace_id on public."website-jobs"
for each row execute function "website-private"."website-guard-campaign-job"();

-- One transaction: a failed child write never leaves a partially saved plan.
-- Each edited job is version-checked; another tab/ClickUp edit is never silently lost.
create function public."website-save-campaign-plan"(p_workspace_id uuid,p_client_id uuid,p_plan jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
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
  insert into public."website-campaigns"(id,workspace_id,client_id,title,objective,notes,start_date,due_date,is_weekly_plan,created_by,updated_by)
  values(v_campaign_id,p_workspace_id,p_client_id,btrim(p_plan->>'title'),nullif(p_plan->>'objective',''),nullif(p_plan->>'notes',''),
    initial_date,initial_date+(jsonb_array_length(p_plan->'weeks')*7-1),true,auth.uid(),auth.uid())
  on conflict(id) do update set title=excluded.title,objective=excluded.objective,notes=excluded.notes,
    start_date=excluded.start_date,due_date=excluded.due_date,updated_by=auth.uid();

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
          deliverables=job->'deliverables',campaign_week_id=week_id,updated_by=auth.uid()
        where j.id=job_id;
      else
        if job->>'updated_at' is not null then raise exception 'Job unavailable.'; end if;
        insert into public."website-jobs"(id,workspace_id,client_id,status_id,title,shoot_date,due_date,description,location,deliverables,campaign_week_id,created_by,updated_by)
        values(job_id,p_workspace_id,p_client_id,(job->>'status_id')::uuid,btrim(job->>'title'),
          (job->>'shoot_date')::date,(job->>'due_date')::date,nullif(job->>'description',''),nullif(job->>'location',''),job->'deliverables',week_id,auth.uid(),auth.uid());
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
end $$;
revoke all on function public."website-save-campaign-plan"(uuid,uuid,jsonb) from public,anon;
grant execute on function public."website-save-campaign-plan"(uuid,uuid,jsonb) to authenticated;

-- A reschedule must keep the successor attached to the same campaign week.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public."website-delay-job"(uuid,date,text)'::regprocedure);
  if position('brief_details, shoot_end_time, created_by' in definition)=0 then raise exception 'Unexpected delay function; review campaign linkage.'; end if;
  definition:=replace(definition,'brief_details, shoot_end_time, created_by','brief_details, shoot_end_time, campaign_week_id, created_by');
  definition:=replace(definition,'v_source.brief_details, v_source.shoot_end_time, auth.uid()','v_source.brief_details, v_source.shoot_end_time, v_source.campaign_week_id, auth.uid()');
  execute definition;
end $$;
