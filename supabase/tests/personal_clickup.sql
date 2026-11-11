-- Real roles + real triggers. Fixtures, queues, imported records, leases and
-- receipts all roll back. No external provider requests or user changes occur.
begin;
create temporary table personal_qa as select c.workspace_id,c.id client_id,
  (select user_id from public."website-production-team" where workspace_id=c.workspace_id and is_primary_videographer and is_active limit 1) owner_id,
  (select user_id from public."website-production-team" where workspace_id=c.workspace_id and is_active and not is_primary_videographer limit 1) person_id,
  (select user_id from public."website-production-team" where workspace_id=c.workspace_id and not is_active limit 1) disabled_id,
  gen_random_uuid() conn_id,gen_random_uuid() job_id,gen_random_uuid() other_job_id,gen_random_uuid() task_id,gen_random_uuid() token,
  (select md5(jsonb_build_array(list_id,assigned_user_id,enabled,status_mapping,target_client_id,sync_subtasks)::text) from public."website-clickup-integrations" where workspace_id=c.workspace_id) jobs_config,
  (select md5(jsonb_agg(jsonb_build_array(list_id,user_id,enabled) order by user_id)::text) from public."website-clickup-outlook-bridge" where workspace_id=c.workspace_id) outlook_config
from public."website-clients" c where lower(c.name)='autopacific group' and c.archived_at is null;
grant select,update on personal_qa to service_role;
grant select on personal_qa to authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true) from personal_qa;
set local role service_role;
do $$ declare c record; mapping jsonb; conn uuid; planning uuid; todo uuid; imported uuid; imported_again uuid; asset uuid; updated timestamptz; current_stage text; old_revision bigint; i integer; begin
  select * into c from personal_qa;
  assert c.person_id is not null and c.disabled_id is not null,'Existing active and disabled team accounts required';
  mapping:='{"planning":"PLANNING","scheduled":"SCHEDULED","production":"EDITING","review":"APPROVAL","delayed":"DELAYED","delivered":"COMPLETE"}';
  begin
    perform public."website-configure-personal-clickup"(c.workspace_id,c.owner_id,'999900001','QA primary',42,'QA',mapping,true);
    raise exception 'Primary routing was not protected';
  exception when raise_exception then if sqlerrm='Primary routing was not protected' then raise;end if;end;
  begin
    perform public."website-configure-personal-clickup"(c.workspace_id,c.person_id,'1300350000002054','QA reserved',42,'QA',mapping,true);
    raise exception 'Jobs list was not reserved';
  exception when check_violation then null;when raise_exception then if sqlerrm='Jobs list was not reserved' then raise;end if;end;
  begin
    perform public."website-configure-personal-clickup"(c.workspace_id,c.person_id,'1300350000012117','QA reserved',42,'QA',mapping,true);
    raise exception 'Outlook list was not reserved';
  exception when check_violation then null;when raise_exception then if sqlerrm='Outlook list was not reserved' then raise;end if;end;
  begin
    perform public."website-configure-personal-clickup"(c.workspace_id,c.disabled_id,'999900002','QA disabled',43,'QA',mapping,true);
    raise exception 'Disabled account connected';
  exception when raise_exception then if sqlerrm='Disabled account connected' then raise;end if;end;
  conn:=public."website-configure-personal-clickup"(c.workspace_id,c.person_id,'999900001','QA personal list',42,'QA',mapping,true);
  update personal_qa set conn_id=conn;
  assert not public."website-personal-clickup-lease"(conn,c.token,'claim'),'Worker started before signed connection was ready';
  update public."website-clickup-personal-connections" set ready=true where id=conn;
  select id into planning from public."website-job-statuses" where workspace_id=c.workspace_id and key='planning';
  select id into todo from public."website-task-statuses" where workspace_id=c.workspace_id and key='not_started';
  insert into public."website-jobs"(id,workspace_id,client_id,status_id,title,assignee_ids) values
    (c.job_id,c.workspace_id,c.client_id,planning,'QA personal assigned',array[c.person_id]),
    (c.other_job_id,c.workspace_id,c.client_id,planning,'QA personal unassigned',array[c.owner_id]);
  insert into public."website-job-tasks"(id,workspace_id,job_id,status_id,title,assignee_ids) values(c.task_id,c.workspace_id,c.other_job_id,todo,'QA personal independent asset',array[c.person_id]);
  assert exists(select 1 from public."website-clickup-personal-outbox" where connection_id=conn and record_kind='job' and record_id=c.job_id),'Assigned job not queued';
  assert not exists(select 1 from public."website-clickup-personal-outbox" where connection_id=conn and record_kind='job' and record_id=c.other_job_id),'Unassigned parent was copied';
  assert exists(select 1 from public."website-clickup-personal-outbox" where connection_id=conn and record_kind='task' and record_id=c.task_id),'Independent task assignment ignored';
  insert into public."website-work-record-notes"(workspace_id,record_kind,job_id,body,created_by,updated_by,mention_user_ids)
    values(c.workspace_id,'job',c.other_job_id,'QA personal mention does not assign',c.owner_id,c.owner_id,array[c.person_id]);
  assert not exists(select 1 from public."website-clickup-personal-outbox" where connection_id=conn and record_kind='job' and record_id=c.other_job_id),'Mention/follow routed a job';
  select q.revision into old_revision from public."website-clickup-personal-outbox" q where connection_id=conn and record_kind='job' and record_id=c.job_id;
  update public."website-jobs" set title=title||' changed' where id=c.job_id;
  delete from public."website-clickup-personal-outbox" q where q.connection_id=conn and q.record_kind='job' and q.record_id=c.job_id and q.revision=old_revision;
  assert exists(select 1 from public."website-clickup-personal-outbox" where connection_id=conn and record_kind='job' and record_id=c.job_id),'Newer queue revision was lost';
  assert public."website-personal-clickup-lease"(conn,c.token,'claim'),'Cannot claim active connection';
  assert not public."website-personal-clickup-lease"(conn,gen_random_uuid(),'claim'),'Concurrent worker claimed same connection';
  assert not public."website-personal-clickup-lease"(conn,gen_random_uuid(),'renew'),'Wrong token renewed lease';
  begin perform public."website-configure-personal-clickup"(c.workspace_id,c.person_id,null,null,null,null,null,false);raise exception 'Manager changed leased connection';
    exception when raise_exception then if sqlerrm='Manager changed leased connection' then raise;end if;end;
  begin perform public."website-apply-personal-clickup"(conn,gen_random_uuid(),'qa-remote','job',null,null,null,null,'{"title":"QA personal imported","status":"PLANNING"}', 'planning','remote-hash','owned-hash','QA brief');raise exception 'Wrong worker mutated CRM';
    exception when raise_exception then if sqlerrm='Wrong worker mutated CRM' then raise;end if;end;
  imported:=public."website-apply-personal-clickup"(conn,c.token,'qa-remote','job',null,null,null,null,'{"title":"QA personal imported","status":"PLANNING"}', 'planning','remote-hash','owned-hash','QA brief');
  imported_again:=public."website-apply-personal-clickup"(conn,c.token,'qa-remote','job',null,null,null,null,'{"title":"QA personal imported","status":"PLANNING"}', 'planning','remote-hash','owned-hash','QA brief');
  assert imported=imported_again,'Duplicate incoming job';
  assert (select assignee_ids=array[c.person_id] and description='QA brief' from public."website-jobs" where id=imported),'Incoming assignment/brief incorrect';
  asset:=public."website-apply-personal-clickup"(conn,c.token,'qa-asset','task',null,imported,null,null,'{"title":"QA personal imported asset","status":"SCHEDULED"}', 'not_started','remote-hash','owned-hash','QA asset brief');
  assert (select job_id=imported and assignee_ids=array[c.person_id] from public."website-job-tasks" where id=asset),'Incoming subtask relation/assignment incorrect';
  select j.updated_at,s.key into updated,current_stage from public."website-jobs" j join public."website-job-statuses" s on s.id=j.status_id where j.id=imported;
  begin perform public."website-apply-personal-clickup"(conn,c.token,'qa-remote','job',imported,null,'1970-01-01',null,jsonb_build_object('title','QA stale edit','status',mapping->>current_stage), current_stage,'remote-hash','owned-hash',null);raise exception 'Stale update overwrote CRM';
    exception when raise_exception then if sqlerrm='Stale update overwrote CRM' then raise;end if;end;
  begin perform public."website-apply-personal-clickup"(conn,c.token,'qa-remote','job',imported,null,updated,null,'{"title":"QA personal imported","status":"COMPLETE"}', 'delivered','remote-hash','owned-hash',null);raise exception 'Remote bypassed derived job stage';
    exception when raise_exception then if sqlerrm='Remote bypassed derived job stage' then raise;end if;end;
  perform public."website-queue-personal-inbound"(conn,'qa-event','qa-dedupe');
  select q.revision into old_revision from public."website-clickup-personal-inbox" q where connection_id=conn and remote_id='qa-event';
  perform public."website-queue-personal-inbound"(conn,'qa-event','qa-dedupe');
  assert (select q.revision=old_revision from public."website-clickup-personal-inbox" q where connection_id=conn and remote_id='qa-event'),'Duplicate webhook reset event';
  delete from public."website-clickup-personal-budget" where workspace_id=c.workspace_id;
  for i in 1..20 loop assert public."website-personal-clickup-request"(c.workspace_id),'Request budget ended too early';end loop;
  assert not public."website-personal-clickup-request"(c.workspace_id),'Personal connections exceeded shared request budget';
  assert public."website-personal-clickup-lease"(conn,c.token,'release'),'Cannot release own lease';
  perform public."website-configure-personal-clickup"(c.workspace_id,c.person_id,null,null,null,null,null,false);
  assert not public."website-personal-clickup-lease"(conn,c.token,'claim'),'Paused connection still syncing';
  perform public."website-queue-personal-inbound"(conn,'qa-paused','qa-paused-event');
  assert not exists(select 1 from public."website-clickup-personal-inbox" where connection_id=conn and remote_id='qa-paused'),'Paused connection still accepting imports';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',person_id,'role','authenticated','aal','aal2')::text,true) from personal_qa;
do $$ begin
  assert not exists(select 1 from public."website-clickup-personal-connections"),'Marketing member can read manager-only configuration';
  assert not has_table_privilege('authenticated','public."website-clickup-personal-webhooks"','SELECT'),'Webhook material exposed';
  assert not has_function_privilege('authenticated','public."website-configure-personal-clickup"(uuid,uuid,text,text,bigint,text,jsonb,boolean)','EXECUTE'),'Configuration callable by browser';
  assert not has_function_privilege('anon','public."website-apply-personal-clickup"(uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,jsonb,text,text,text,text)','EXECUTE'),'Anonymous incoming mutations';
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true) from personal_qa;
do $$ declare c record;begin
  select * into c from personal_qa;
  assert exists(select 1 from public."website-clickup-personal-connections" where id=c.conn_id),'Manager cannot view connection status';
  assert not has_table_privilege('authenticated','public."website-clickup-personal-connections"','UPDATE'),'Browser can bypass manager validation';
end $$;
reset role;
do $$ declare c record;begin
  select * into c from personal_qa;
  assert c.jobs_config=(select md5(jsonb_build_array(list_id,assigned_user_id,enabled,status_mapping,target_client_id,sync_subtasks)::text) from public."website-clickup-integrations" where workspace_id=c.workspace_id),'Primary Jobs configuration changed';
  assert c.outlook_config=(select md5(jsonb_agg(jsonb_build_array(list_id,user_id,enabled) order by user_id)::text) from public."website-clickup-outlook-bridge" where workspace_id=c.workspace_id),'Outlook configuration changed';
end $$;
select 'PASS: reserved destinations, personal assignment routing, atomic imports, subtask relations, revision/lease safety, webhook dedupe, API budget, pause, RLS and unchanged primary connections' as result;
rollback;
