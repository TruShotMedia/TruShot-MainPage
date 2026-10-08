-- Keep completed-job reporting dates durable across every status-update pathway.
create or replace function "website-private"."website-maintain-job-delivered-at"()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_is_closed boolean;
begin
  select status.is_closed
  into target_is_closed
  from public."website-job-statuses" as status
  where status.id = new.status_id
    and status.workspace_id = new.workspace_id;

  if target_is_closed is null then
    raise exception 'Job status is unavailable for this workspace.';
  end if;

  if target_is_closed then
    new.delivered_at := coalesce(new.delivered_at, now());
  else
    new.delivered_at := null;
  end if;

  return new;
end;
$$;

revoke all on function "website-private"."website-maintain-job-delivered-at"() from public;
revoke all on function "website-private"."website-maintain-job-delivered-at"() from anon;
revoke all on function "website-private"."website-maintain-job-delivered-at"() from authenticated;

drop trigger if exists "website-maintain-job-delivered-at-trigger" on public."website-jobs";

create trigger "website-maintain-job-delivered-at-trigger"
before insert or update of status_id on public."website-jobs"
for each row
execute function "website-private"."website-maintain-job-delivered-at"();

update public."website-jobs" as job
set delivered_at = coalesce(job.delivered_at, job.updated_at, job.created_at, now())
from public."website-job-statuses" as status
where status.id = job.status_id
  and status.workspace_id = job.workspace_id
  and status.is_closed
  and job.delivered_at is null;

update public."website-jobs" as job
set delivered_at = null
from public."website-job-statuses" as status
where status.id = job.status_id
  and status.workspace_id = job.workspace_id
  and not status.is_closed
  and job.delivered_at is not null;

comment on function "website-private"."website-maintain-job-delivered-at"() is
  'Maintains the completion timestamp used by CRM completed-job reporting and date filters.';
