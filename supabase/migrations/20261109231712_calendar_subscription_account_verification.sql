-- Applied remote migration version: 20261109231745.
-- Use the supported Auth admin API in the server for deleted/banned checks.
-- service_role intentionally has no direct SELECT grant on auth.users.
-- No permissions are broadened. The RPC stays SECURITY INVOKER/service-only.
create or replace function public."website-read-calendar-subscription"(p_token_hash text)
returns jsonb language sql stable security invoker set search_path='' as $$
with owner as materialized (
  select s.workspace_id,s.user_id
  from public."website-calendar-subscriptions" s
  where s.token_hash=p_token_hash
    and (
      exists(select 1 from public."website-admin-users" a where a.workspace_id=s.workspace_id and a.user_id=s.user_id and a.is_active)
      or (
        exists(select 1 from public."website-portal-users" p where p.workspace_id=s.workspace_id and p.user_id=s.user_id and p.portal_key='autopacific' and p.is_active)
        and exists(select 1 from public."website-production-team" t where t.workspace_id=s.workspace_id and t.user_id=s.user_id and t.is_active and t.role in ('manager','videographer'))
      )
    )
), client as materialized (
  select c.id,c.workspace_id from public."website-clients" c join owner o on o.workspace_id=c.workspace_id
  where lower(c.name)='autopacific group' and c.archived_at is null
), jobs as materialized (
  select j.id,j.title,j.shoot_date,j.shoot_time,j.shoot_end_time,j.due_date,j.due_time,j.location,j.assignee_ids,j.updated_at,
    s.label as status,s.key as status_key,s.is_closed
  from public."website-jobs" j join client c on c.id=j.client_id and c.workspace_id=j.workspace_id
  join owner o on o.workspace_id=j.workspace_id
  join public."website-job-statuses" s on s.id=j.status_id and s.workspace_id=j.workspace_id
  where j.archived_at is null
), entries as (
  select 'job-'||j.id||'-shoot' as uid,
    case when j.status_key='delayed' then '[Delayed] ' when j.is_closed then '[Completed] ' else '' end||j.title as title,
    'Job / shoot'::text as kind,j.shoot_date as start_date,j.shoot_time as start_time,
    j.shoot_date as end_date,j.shoot_end_time as end_time,j.shoot_time is null as is_all_day,
    j.location,null::text as detail,j.status,j.status_key='delayed' as cancelled,j.status_key='planning' as tentative,
    false as transparent,j.updated_at
  from jobs j cross join owner o
  where j.assignee_ids @> array[o.user_id] and j.shoot_date is not null
    and j.shoot_date between current_date-interval '1 year' and current_date+interval '1 year'
  union all
  select 'job-'||j.id||'-due','Due: '||j.title,'Job deadline',j.due_date,j.due_time,j.due_date,null,j.due_time is null,
    null,null,j.status,j.status_key='delayed',j.status_key='planning',true,j.updated_at
  from jobs j cross join owner o
  where j.assignee_ids @> array[o.user_id] and j.due_date is not null
    and j.due_date between current_date-interval '1 year' and current_date+interval '1 year'
  union all
  select 'task-'||t.id,'Due: '||t.title,'Task / deliverable deadline',coalesce(t.due_date,j.due_date),t.due_time,
    coalesce(t.due_date,j.due_date),null,t.due_time is null,null,'Job: '||j.title,s.label,s.key='delayed',false,true,greatest(t.updated_at,j.updated_at)
  from public."website-job-tasks" t join jobs j on j.id=t.job_id join owner o on o.workspace_id=t.workspace_id
    join public."website-task-statuses" s on s.id=t.status_id and s.workspace_id=t.workspace_id
  where t.archived_at is null and t.assignee_ids @> array[o.user_id]
    and coalesce(t.due_date,j.due_date) between current_date-interval '1 year' and current_date+interval '1 year'
  union all
  select 'event-'||e.id,e.title,'Event',e.start_date,e.start_time,e.end_date,e.end_time,e.is_all_day,
    e.location,null,null,false,false,false,e.updated_at
  from public."website-calendar-events" e join client c on c.id=e.client_id and c.workspace_id=e.workspace_id
    join owner o on o.workspace_id=e.workspace_id
  where e.assignee_ids @> array[o.user_id]
    and e.end_date>=current_date-interval '1 year' and e.start_date<=current_date+interval '1 year'
  union all
  select 'flight-'||f.id,f.title,'Flight',f.departure_date,f.departure_time,f.arrival_date,f.arrival_time,false,
    f.origin_location||' → '||f.destination_location,
    concat_ws(' · ',nullif(f.departure_airline,''),nullif(f.departure_flight_number,''),nullif(f.arrival_airline,''),nullif(f.arrival_flight_number,'')),
    null,false,false,false,f.updated_at
  from public."website-flight-events" f join client c on c.id=f.client_id and c.workspace_id=f.workspace_id
    join owner o on o.workspace_id=f.workspace_id
  where f.assignee_ids @> array[o.user_id]
    and f.arrival_date>=current_date-interval '1 year' and f.departure_date<=current_date+interval '1 year'
), bounded as (select * from entries order by uid limit 4001)
select case when exists(select 1 from owner) then
  jsonb_build_object('owner_id',(select user_id from owner),'events',coalesce((select jsonb_agg(to_jsonb(b) order by uid) from bounded b),'[]'::jsonb))
  else null end;
$$;
