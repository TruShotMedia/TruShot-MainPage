-- Applied remote migration version: 20261028105611.
-- Shared brief deadlines may be edited by Marketing, without granting general
-- edit access to the videographer's tasks. Propagate only inherited deadlines.
create function "website-private"."website-team-job-deadline"()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public."website-clients" c where c.id=new.client_id and c.workspace_id=new.workspace_id and lower(c.name)='autopacific group') then return new; end if;
  update public."website-job-tasks" t set due_date=new.due_date
  where t.workspace_id=new.workspace_id and t.job_id=new.id and t.archived_at is null and not t.due_date_is_override
    and t.due_date is distinct from new.due_date
    and not exists(select 1 from public."website-task-delay-history" h where h.workspace_id=t.workspace_id and h.successor_task_id=t.id);
  return new;
end $$;
revoke all on function "website-private"."website-team-job-deadline"() from public,anon,authenticated,service_role;
create trigger "website-team-job-deadline" after update of due_date on public."website-jobs"
for each row when(old.due_date is distinct from new.due_date) execute function "website-private"."website-team-job-deadline"();

-- A stale second browser tab must never mark a newer read comment as unread.
create function "website-private"."website-monotonic-note-read"()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.user_id<>old.user_id or new.note_id<>old.note_id then raise exception 'Read receipts cannot be reassigned.'; end if;
  new.seen_revision:=greatest(new.seen_revision,old.seen_revision);
  return new;
end $$;
revoke all on function "website-private"."website-monotonic-note-read"() from public,anon,authenticated,service_role;
create trigger "website-monotonic-note-read" before update on public."website-note-reads"
for each row execute function "website-private"."website-monotonic-note-read"();
