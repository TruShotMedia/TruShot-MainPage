-- Notification interest is separate from assignment and from record access.
-- Following never grants edit rights, changes workloads, or queues ClickUp.
create table public."website-work-record-followers" (
  workspace_id uuid not null references public."website-workspaces"(id) on delete cascade,
  record_kind text not null check(record_kind in ('job','task')),
  job_id uuid references public."website-jobs"(id) on delete cascade,
  task_id uuid references public."website-job-tasks"(id) on delete cascade,
  record_id uuid generated always as (coalesce(job_id,task_id)) stored,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_following boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,record_kind,record_id,user_id),
  check((record_kind='job' and job_id is not null and task_id is null)
     or (record_kind='task' and task_id is not null and job_id is null))
);
create index "website-work-record-followers-user-idx" on public."website-work-record-followers"(user_id);
create index "website-work-record-followers-job-idx" on public."website-work-record-followers"(job_id) where job_id is not null;
create index "website-work-record-followers-task-idx" on public."website-work-record-followers"(task_id) where task_id is not null;
create index "website-work-record-followers-active-idx" on public."website-work-record-followers"(workspace_id,record_id,user_id) where is_following;
comment on table public."website-work-record-followers" is 'AutoPacific job/task update preferences only; false rows retain an explicit unfollow choice. Does not grant record access.';

create function "website-private"."website-can-follow-work-record"(p_workspace uuid,p_kind text,p_record uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public."website-jobs" j
    join public."website-clients" c on c.id=j.client_id and c.workspace_id=j.workspace_id
    where j.workspace_id=p_workspace and j.archived_at is null and lower(btrim(c.name))='autopacific group'
      and ((p_kind='job' and j.id=p_record) or (p_kind='task' and exists(
        select 1 from public."website-job-tasks" t where t.id=p_record and t.job_id=j.id
          and t.workspace_id=j.workspace_id and t.archived_at is null)))
  );
$$;
revoke all on function "website-private"."website-can-follow-work-record"(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function "website-private"."website-can-follow-work-record"(uuid,text,uuid) to authenticated;
alter table public."website-work-record-followers" enable row level security;
revoke all on public."website-work-record-followers" from public,anon,authenticated;
grant select on public."website-work-record-followers" to authenticated;
grant insert(workspace_id,record_kind,job_id,task_id,user_id,is_following) on public."website-work-record-followers" to authenticated;
grant update(is_following,updated_at) on public."website-work-record-followers" to authenticated;
grant select,insert,update,delete on public."website-work-record-followers" to service_role;
create policy "own-work-followers-read" on public."website-work-record-followers" for select to authenticated
using(user_id=(select auth.uid()) and (select "website-private"."website-can-follow-work-record"(workspace_id,record_kind,record_id)));
create policy "own-work-followers-add" on public."website-work-record-followers" for insert to authenticated
with check(user_id=(select auth.uid()) and (select "website-private"."website-can-follow-work-record"(workspace_id,record_kind,record_id)));
create policy "own-work-followers-edit" on public."website-work-record-followers" for update to authenticated
using(user_id=(select auth.uid()) and (select "website-private"."website-can-follow-work-record"(workspace_id,record_kind,record_id)))
with check(user_id=(select auth.uid()) and (select "website-private"."website-can-follow-work-record"(workspace_id,record_kind,record_id)));

create function public."website-set-work-record-following"(p_workspace uuid,p_kind text,p_record uuid,p_following boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or p_following is null or not coalesce("website-private"."website-can-follow-work-record"(p_workspace,p_kind,p_record),false)
    then raise exception 'This item is not available to follow.'; end if;
  insert into public."website-work-record-followers"(workspace_id,record_kind,job_id,task_id,user_id,is_following)
    values(p_workspace,p_kind,case when p_kind='job' then p_record end,case when p_kind='task' then p_record end,auth.uid(),p_following)
    on conflict(workspace_id,record_kind,record_id,user_id) do update set is_following=excluded.is_following,updated_at=now();
  return p_following;
end $$;
revoke all on function public."website-set-work-record-following"(uuid,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public."website-set-work-record-following"(uuid,text,uuid,boolean) to authenticated;

-- Runs only after an authorised note write has passed the existing RLS and
-- active-member mention validation. The exact record is derived from that
-- note, never a caller-supplied follower target. Non-AutoPacific notes are ignored.
create function "website-private"."website-follow-new-note-mentions"()
returns trigger language plpgsql security definer set search_path='' as $$
declare targets uuid[];
begin
  if not exists(select 1 from public."website-jobs" j
    left join public."website-job-tasks" t on t.job_id=j.id and t.workspace_id=j.workspace_id and t.id=new.task_id
    join public."website-clients" c on c.id=j.client_id and c.workspace_id=j.workspace_id
    where j.workspace_id=new.workspace_id and j.archived_at is null and lower(btrim(c.name))='autopacific group'
      and ((new.record_kind='job' and j.id=new.job_id) or (new.record_kind='task' and t.id=new.task_id and t.archived_at is null)))
    then return new; end if;
  targets:=new.mention_user_ids;
  if tg_op='UPDATE' then
    targets:=array(select u from unnest(targets) u where not u=any(old.mention_user_ids));
  end if;
  insert into public."website-work-record-followers"(workspace_id,record_kind,job_id,task_id,user_id,is_following)
    select new.workspace_id,new.record_kind,new.job_id,new.task_id,t.user_id,true
    from public."website-production-team" t where t.workspace_id=new.workspace_id and t.is_active and t.user_id=any(targets)
    on conflict(workspace_id,record_kind,record_id,user_id) do update set is_following=true,updated_at=now();
  return new;
end $$;
revoke all on function "website-private"."website-follow-new-note-mentions"() from public,anon,authenticated,service_role;
create trigger "website-follow-new-note-mentions" after insert or update of mention_user_ids on public."website-work-record-notes"
for each row execute function "website-private"."website-follow-new-note-mentions"();

-- Preserve the intended relationship of existing explicit mentions; do not
-- change any note text, read receipts, assignments or parent/child records.
insert into public."website-work-record-followers"(workspace_id,record_kind,job_id,task_id,user_id,is_following)
select distinct n.workspace_id,n.record_kind,n.job_id,n.task_id,person.user_id,true
from public."website-work-record-notes" n
left join public."website-job-tasks" t on t.id=n.task_id and t.workspace_id=n.workspace_id and t.archived_at is null
join public."website-jobs" j on j.id=coalesce(n.job_id,t.job_id) and j.workspace_id=n.workspace_id and j.archived_at is null
join public."website-clients" c on c.id=j.client_id and c.workspace_id=j.workspace_id and lower(btrim(c.name))='autopacific group'
join public."website-production-team" person on person.workspace_id=n.workspace_id and person.is_active and person.user_id=any(n.mention_user_ids)
on conflict do nothing;

create or replace function public."website-team-comment-feed"(p_workspace uuid)
returns table(id uuid,body text,created_by uuid,created_at timestamptz,updated_at timestamptz,
  mention_user_ids uuid[],record_kind text,job_id uuid,task_id uuid,record_title text,unread boolean)
language sql stable security invoker set search_path='' as $$
  select n.id,n.body,n.created_by,n.created_at,n.updated_at,n.mention_user_ids,n.record_kind,n.job_id,n.task_id,
    case when n.record_kind='task' then t.title else j.title end,
    coalesce(n.updated_by,n.created_by) is distinct from (select auth.uid())
      and n.updated_at>=coalesce(me.enabled_at,'-infinity'::timestamptz)
      and (r.seen_revision is null or r.seen_revision<n.updated_at)
  from public."website-work-record-notes" n
  left join public."website-job-tasks" t on t.id=n.task_id and t.workspace_id=n.workspace_id and t.archived_at is null
  join public."website-jobs" j on j.id=coalesce(n.job_id,t.job_id) and j.workspace_id=n.workspace_id and j.archived_at is null
  join public."website-clients" c on c.id=j.client_id and c.workspace_id=j.workspace_id and lower(btrim(c.name))='autopacific group'
  left join public."website-note-reads" r on r.note_id=n.id and r.user_id=(select auth.uid())
  left join public."website-production-team" me on me.workspace_id=n.workspace_id and me.user_id=(select auth.uid()) and me.is_active
  where n.workspace_id=p_workspace and (select auth.uid()) is not null
    and ((n.record_kind='job' and (select auth.uid())=any(j.assignee_ids))
      or (n.record_kind='task' and (select auth.uid())=any(t.assignee_ids))
      or (select auth.uid())=any(n.mention_user_ids)
      or exists(select 1 from public."website-work-record-followers" f where f.workspace_id=n.workspace_id
        and f.record_kind=n.record_kind and f.record_id=coalesce(n.job_id,n.task_id) and f.user_id=(select auth.uid()) and f.is_following))
  order by n.updated_at desc,n.id limit 200;
$$;
revoke all on function public."website-team-comment-feed"(uuid) from public,anon;
grant execute on function public."website-team-comment-feed"(uuid) to authenticated;
