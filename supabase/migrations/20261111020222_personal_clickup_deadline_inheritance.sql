-- Keep imported assets consistent with the CRM: no custom deadline means
-- inherit the parent job deadline, including after clearing a ClickUp date.
create or replace function public."website-apply-personal-clickup"(p_connection uuid,p_token uuid,p_remote text,p_kind text,p_record uuid,
  p_parent uuid,p_expected timestamptz,p_parent_expected timestamptz,p_state jsonb,p_status_key text,p_remote_hash text,p_owned_hash text,p_description text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare conn public."website-clickup-personal-connections"; link public."website-clickup-personal-links";
  job public."website-jobs"; asset public."website-job-tasks"; client uuid; status uuid; chosen uuid; effective_due date; effective_time time;
begin
  select * into conn from public."website-clickup-personal-connections" where id=p_connection for update;
  if not conn.enabled or not conn.ready or conn.lease_token is distinct from p_token or conn.lease_until<now()
    or not exists(select 1 from public."website-production-team" t where t.workspace_id=conn.workspace_id and t.user_id=conn.user_id and t.is_active and not t.is_primary_videographer)
    then raise exception 'Connection is not active.';end if;
  if p_kind not in ('job','task') or char_length(btrim(p_state->>'title')) not between 1 and 500 then raise exception 'Invalid incoming record.';end if;
  select id into client from public."website-clients" where workspace_id=conn.workspace_id and lower(btrim(name))='autopacific group' and archived_at is null;
  if client is null then raise exception 'Client unavailable.';end if;
  select * into link from public."website-clickup-personal-links" where clickup_task_id=p_remote for update;
  if link.connection_id is not null and link.connection_id<>p_connection then raise exception 'Remote identity is already claimed.';end if;
  if p_record is null and link.record_id is not null then return link.record_id;end if;
  if p_record is not null and (link.record_id is distinct from p_record or link.record_kind<>p_kind) then raise exception 'Mirror identity changed.';end if;
  chosen:=coalesce(p_record,gen_random_uuid());
  if p_kind='job' then
    select id into status from public."website-job-statuses" where workspace_id=conn.workspace_id and key=p_status_key and is_active;
    if status is null or not conn.status_mapping?p_status_key then raise exception 'Unknown job stage.';end if;
    if p_record is null then
      insert into public."website-jobs"(id,workspace_id,client_id,title,status_id,shoot_date,shoot_time,due_date,due_time,description,assignee_ids)
      values(chosen,conn.workspace_id,client,btrim(p_state->>'title'),status,(p_state->>'shoot_date')::date,(p_state->>'shoot_time')::time,
        (p_state->>'due_date')::date,(p_state->>'due_time')::time,left(p_description,20000),array[conn.user_id]);
    else
      select * into job from public."website-jobs" where id=p_record and workspace_id=conn.workspace_id for update;
      if job.id is null or job.client_id<>client or job.archived_at is not null or not conn.user_id=any(job.assignee_ids) or job.updated_at is distinct from p_expected then raise exception 'CRM record changed.';end if;
      if status<>job.status_id and exists(select 1 from public."website-job-tasks" t where t.workspace_id=conn.workspace_id and t.job_id=job.id and t.archived_at is null) then raise exception 'Linked tasks control this job stage.';end if;
      update public."website-jobs" set title=btrim(p_state->>'title'),status_id=status,shoot_date=(p_state->>'shoot_date')::date,
        shoot_time=(p_state->>'shoot_time')::time,due_date=(p_state->>'due_date')::date,due_time=(p_state->>'due_time')::time where id=job.id;
    end if;
  else
    select * into job from public."website-jobs" where id=p_parent and workspace_id=conn.workspace_id for update;
    if job.id is null or job.client_id<>client or job.archived_at is not null or (p_record is not null and job.updated_at is distinct from p_parent_expected) then raise exception 'Parent changed.';end if;
    select id into status from public."website-task-statuses" where workspace_id=conn.workspace_id and key=p_status_key and is_active;
    if status is null then raise exception 'Unknown asset stage.';end if;
    if p_record is null then
      if not exists(select 1 from public."website-clickup-personal-links" l where l.connection_id=p_connection and l.record_kind='job' and l.record_id=job.id and l.archived_at is null) then raise exception 'Unlinked incoming parent.';end if;
      insert into public."website-job-tasks"(id,workspace_id,job_id,title,status_id,due_date,due_time,due_date_is_override,description,assignee_ids)
        values(chosen,conn.workspace_id,job.id,btrim(p_state->>'title'),status,(p_state->>'due_date')::date,(p_state->>'due_time')::time,(p_state->>'due_date') is not null,left(p_description,20000),array[conn.user_id]);
    else
      select * into asset from public."website-job-tasks" where id=p_record and workspace_id=conn.workspace_id for update;
      if asset.id is null or asset.job_id<>job.id or asset.archived_at is not null or not conn.user_id=any(asset.assignee_ids) or asset.updated_at is distinct from p_expected then raise exception 'CRM asset changed.';end if;
      effective_due:=case when asset.due_date_is_override then asset.due_date else coalesce(asset.due_date,job.due_date) end;
      effective_time:=coalesce(asset.due_time,case when coalesce(asset.due_date,job.due_date)=job.due_date then job.due_time end);
      update public."website-job-tasks" set title=btrim(p_state->>'title'),status_id=status,
        due_date=case when p_state->>'due_date' is null then null when (p_state->>'due_date')::date is distinct from effective_due then (p_state->>'due_date')::date else due_date end,
        due_time=case when p_state->>'due_date' is null then null when (p_state->>'due_time')::time is distinct from effective_time then (p_state->>'due_time')::time else due_time end,
        due_date_is_override=case when p_state->>'due_date' is null then false when (p_state->>'due_date')::date is distinct from effective_due or (p_state->>'due_time')::time is distinct from effective_time then true else due_date_is_override end
        where id=asset.id;
    end if;
  end if;
  if p_record is null then
    insert into public."website-clickup-personal-links"(connection_id,record_kind,record_id,record_title,clickup_task_id,origin,last_remote_hash,last_shared_state,last_owned_hash)
      values(p_connection,p_kind,chosen,p_state->>'title',p_remote,'clickup',p_remote_hash,p_state,p_owned_hash);
    -- The INSERT trigger ran before its link existed; make the outbound tag
    -- write explicit and durable in the same claim transaction.
    insert into public."website-clickup-personal-outbox"(connection_id,record_kind,record_id) values(p_connection,p_kind,chosen)
      on conflict(connection_id,record_kind,record_id) do update set revision="website-clickup-personal-outbox".revision+1,requested_at=now();
  else
    update public."website-clickup-personal-links" set last_remote_hash=p_remote_hash,last_shared_state=p_state,last_owned_hash=p_owned_hash,
      last_payload_hash=null,last_error=null,accept_remote_hash=null,last_checked_at=now() where connection_id=p_connection and record_kind=p_kind and record_id=chosen;
  end if;
  return chosen;
end $$;
