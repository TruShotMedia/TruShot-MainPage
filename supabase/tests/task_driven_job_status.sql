-- Transactional verification against the real schema. All fixtures/queues roll back.
begin;
select set_config('request.jwt.claims','{"sub":"d61eb1c9-8a31-4c49-81fd-93dd478493ce","role":"authenticated","aal":"aal2"}',true);
do $verify$
declare
  w uuid := '11111111-1111-4111-8111-111111111111';
  owner_id uuid := 'd61eb1c9-8a31-4c49-81fd-93dd478493ce';
  client_id uuid; j uuid; draft uuid; other_job uuid; next_job uuid; delayed_job uuid;
  planning uuid; scheduled uuid; production uuid; review uuid; delivered uuid; delayed uuid;
  todo uuid; editing uuid; revision uuid; final_review uuid; ready uuid; done uuid; task_delayed uuid;
  a uuid; b uuid; d uuid; successor uuid; expected_status uuid;
begin
  select id into client_id from public."website-clients" where workspace_id=w and lower(name)='autopacific group';
  select id into planning from public."website-job-statuses" where workspace_id=w and key='planning';
  select id into scheduled from public."website-job-statuses" where workspace_id=w and key='scheduled';
  select id into production from public."website-job-statuses" where workspace_id=w and key='production';
  select id into review from public."website-job-statuses" where workspace_id=w and key='review';
  select id into delivered from public."website-job-statuses" where workspace_id=w and key='delivered';
  select id into delayed from public."website-job-statuses" where workspace_id=w and key='delayed';
  select id into todo from public."website-task-statuses" where workspace_id=w and key='not_started';
  select id into editing from public."website-task-statuses" where workspace_id=w and key='in_progress';
  select id into revision from public."website-task-statuses" where workspace_id=w and key='ready_for_revision';
  select id into final_review from public."website-task-statuses" where workspace_id=w and key='final_draft_notes';
  select id into ready from public."website-task-statuses" where workspace_id=w and key='ready_to_post';
  select id into done from public."website-task-statuses" where workspace_id=w and key='posted_done';
  select id into task_delayed from public."website-task-statuses" where workspace_id=w and key='delayed';
  assert client_id is not null and done is not null,'Required scope/statuses unavailable';

  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids,shoot_date)
    values(w,client_id,scheduled,'QA rollback task-driven job',array[owner_id],'2026-12-01') returning id into j;
  update public."website-jobs" set status_id=review where id=j;
  assert (select status_id=review from public."website-jobs" where id=j),'Standalone job lost manual control';
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title)
    values(w,j,todo,'QA unfinished') returning id into a;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title)
    values(w,j,done,'QA done') returning id into b;
  assert (select status_id=scheduled from public."website-jobs" where id=j),'Not Started did not hold job at Scheduled';
  update public."website-jobs" set status_id=delivered where id=j;
  assert (select status_id=scheduled and delivered_at is null from public."website-jobs" where id=j),'Manual/ClickUp override bypassed child status';
  update public."website-job-tasks" set status_id=editing where id=a;
  assert (select status_id=production from public."website-jobs" where id=j),'Editing did not advance job';
  foreach expected_status in array array[revision,final_review,ready] loop
    update public."website-job-tasks" set status_id=expected_status where id=a;
    assert (select status_id=review from public."website-jobs" where id=j),'Review stage mapping incorrect';
  end loop;
  update public."website-job-tasks" set status_id=done where id=a;
  assert (select status_id=delivered and delivered_at is not null from public."website-jobs" where id=j),'All completed tasks did not deliver job';
  update public."website-job-tasks" set status_id=editing where id=a;
  assert (select status_id=production and delivered_at is null from public."website-jobs" where id=j),'Reopened task did not reopen job';
  update public."website-job-tasks" set status_id=task_delayed where id=a;
  assert (select status_id=delivered from public."website-jobs" where id=j),'Delayed historical task held job back';
  update public."website-job-tasks" set status_id=todo,archived_at=now() where id=a;
  assert (select status_id=delivered from public."website-jobs" where id=j),'Archived task held job back';
  update public."website-job-tasks" set archived_at=null where id=a;
  assert (select status_id=scheduled from public."website-jobs" where id=j),'Restored task did not recalculate job';
  delete from public."website-job-tasks" where id=a;
  assert (select status_id=delivered from public."website-jobs" where id=j),'Deleted least task did not recalculate job';
  delete from public."website-job-tasks" where id=b;
  update public."website-jobs" set status_id=review where id=j;
  assert (select status_id=review from public."website-jobs" where id=j),'Final task removal did not restore manual control';

  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids,deliverables)
    values(w,client_id,planning,'QA rollback planning gate',array[owner_id],jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Generated task','date',null))) returning id into draft;
  set constraints "website-jobs-auto-deliverable-tasks" immediate;
  assert (select status_id=planning and shoot_date is null from public."website-jobs" where id=draft),'Deliverables prematurely scheduled planning brief';
  assert (select count(*)=1 from public."website-job-tasks" where job_id=draft),'Deliverable task not generated';
  update public."website-job-tasks" set status_id=editing where job_id=draft;
  assert (select status_id=planning from public."website-jobs" where id=draft),'Task moved draft through manual gate';
  update public."website-jobs" set status_id=scheduled,shoot_date='2026-12-02' where id=draft;
  assert (select status_id=production from public."website-jobs" where id=draft),'Scheduling draft did not pick up existing task stage';

  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,j,todo,'QA move task') returning id into a;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,j,done,'QA done remains') returning id into b;
  update public."website-job-tasks" set job_id=draft where id=a;
  assert (select status_id=delivered from public."website-jobs" where id=j),'Reparent left old parent stale';
  assert (select status_id=scheduled from public."website-jobs" where id=draft),'Reparent left new parent stale';
  update public."website-job-tasks" set status_id=done where job_id=draft;
  assert (select status_id=delivered from public."website-jobs" where id=draft),'Bulk completion did not use final states';

  -- Job and task rescheduling remain atomic, retaining history and successors.
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids,shoot_date)
    values(w,client_id,scheduled,'QA rollback delay source',array[owner_id],'2026-12-01') returning id into delayed_job;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,delayed_job,editing,'QA delay child') returning id into d;
  select successor_job_id into next_job from public."website-delay-job"(delayed_job,'2026-12-04','Weather delay');
  update public."website-job-tasks" set status_id=done where id=d;
  assert (select status_id=delayed from public."website-jobs" where id=delayed_job),'Task resurrected delayed parent';
  update public."website-jobs" set status_id=production where id=delayed_job;
  assert (select status_id=delayed from public."website-jobs" where id=delayed_job),'Stale editor resurrected historical source';
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,next_job,editing,'QA task delay') returning id into d;
  select successor_task_id into successor from public."website-delay-task"(d,'2026-12-08','Approval delay');
  assert (select status_id=scheduled from public."website-jobs" where id=next_job),'Task delay successor did not hold job at Scheduled';
  assert (select status_id=todo from public."website-job-tasks" where id=successor),'Task delay successor not Not Started';

  insert into public."website-jobs"(workspace_id,status_id,title,assignee_ids)
    values(w,review,'QA rollback unrelated client',array[owner_id]) returning id into other_job;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,other_job,todo,'QA unrelated task');
  assert (select status_id=review from public."website-jobs" where id=other_job),'Unrelated client status changed';
  assert (select count(*)=1 from public."website-clickup-sync-outbox" where job_id=next_job and status in ('pending','retry')),'ClickUp queue missing or duplicated';
  assert not has_function_privilege('anon','"website-private"."website-enforce-task-job-status"()','EXECUTE'),'Anonymous can execute privileged trigger';
  assert not has_function_privilege('authenticated','"website-private"."website-rollup-task-job-status"()','EXECUTE'),'Client can execute rollup trigger';
  assert not has_function_privilege('service_role','"website-private"."website-linked-task-job-status"(uuid,uuid)','EXECUTE'),'Helper exposed to API role';
end $verify$;
-- Exercise the actual authenticated RLS path, not only the privileged fixture path.
set local role authenticated;
do $rls$
declare w uuid := '11111111-1111-4111-8111-111111111111'; j uuid; t uuid; todo uuid; review_task uuid; scheduled uuid; c uuid;
begin
  select id into c from public."website-clients" where workspace_id=w and lower(name)='autopacific group';
  select id into scheduled from public."website-job-statuses" where workspace_id=w and key='scheduled';
  select id into todo from public."website-task-statuses" where workspace_id=w and key='not_started';
  select id into review_task from public."website-task-statuses" where workspace_id=w and key='final_draft_notes';
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids) values(w,c,scheduled,'QA rollback authenticated rollup',array[auth.uid()]) returning id into j;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,j,todo,'QA authorised child') returning id into t;
  update public."website-job-tasks" set status_id=review_task where id=t;
  assert (select s.key='review' from public."website-jobs" job join public."website-job-statuses" s on s.id=job.status_id where job.id=j),'Authenticated task save did not roll up parent';
end $rls$;
reset role;
-- Reuse the approved test identity with a transaction-only Marketing role.
-- No real membership/permission changes survive this rollback.
update public."website-production-team" set role='marketing'
  where workspace_id='11111111-1111-4111-8111-111111111111' and user_id='d61eb1c9-8a31-4c49-81fd-93dd478493ce';
set local role authenticated;
do $marketing$
declare w uuid := '11111111-1111-4111-8111-111111111111'; j uuid; t uuid; review_task uuid; scheduled uuid; c uuid; rejected boolean := false;
begin
  assert "website-private"."website-team-role"(w)='marketing','Marketing fixture role unavailable';
  select id into c from public."website-clients" where workspace_id=w and lower(name)='autopacific group';
  select id into scheduled from public."website-job-statuses" where workspace_id=w and key='scheduled';
  select id into review_task from public."website-task-statuses" where workspace_id=w and key='final_draft_notes';
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids) values(w,c,scheduled,'QA rollback Marketing approval',array[auth.uid()]) returning id into j;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,j,review_task,'QA review') returning id into t;
  perform public."website-approve-production-task"(t);
  assert (select s.key='delivered' from public."website-jobs" job join public."website-job-statuses" s on s.id=job.status_id where job.id=j),'Marketing approval did not deliver parent';
  -- Ordinary Marketing may not edit the videographer's task. Approval does not
  -- grant direct access to either private rollup function.
  begin perform "website-private"."website-rollup-task-job-status"(); exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Marketing can invoke privileged trigger directly';
end $marketing$;
reset role;
select 'PASS: status mappings, slowest task, completion/reopening, archive/restore/delete, reparent/bulk, Planning gate, generated deliverables, rescheduling history, standalone/manual control, client isolation, ClickUp queue, private functions and authenticated RLS. All fixtures rolled back.' as verification;
rollback;
