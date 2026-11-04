-- Rollback-only integration verification. No HTTP requests or lasting fixtures.
begin;
select set_config('request.jwt.claims', '{"sub":"d61eb1c9-8a31-4c49-81fd-93dd478493ce","role":"authenticated","aal":"aal2"}', true);
do $verify$
declare
  w uuid := '11111111-1111-4111-8111-111111111111';
  owner_id uuid := 'd61eb1c9-8a31-4c49-81fd-93dd478493ce';
  c uuid; j uuid; other_job uuid; closed_job uuid; clone_job uuid;
  planned uuid; delivered uuid; initial_status uuid; done_status uuid;
  first_item uuid := gen_random_uuid(); second_item uuid := gen_random_uuid(); third_item uuid := gen_random_uuid();
  first_task uuid; second_task uuid; copied_task uuid; manual_task uuid;
  token uuid := gen_random_uuid(); other_token uuid := gen_random_uuid();
begin
  select target_client_id into c from public."website-clickup-integrations" where workspace_id=w and enabled;
  select id into planned from public."website-job-statuses" where workspace_id=w and key='planning';
  select id into delivered from public."website-job-statuses" where workspace_id=w and key='delivered';
  select id into initial_status from public."website-task-statuses" where workspace_id=w and key='not_started';
  select id into done_status from public."website-task-statuses" where workspace_id=w and key='posted_done';
  assert c is not null and planned is not null and initial_status is not null, 'Required fixture scope unavailable';
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,due_date,assignee_ids,deliverables,created_by,updated_by)
    values(w,c,planned,'QA rollback automatic deliverables','2026-12-15',array[owner_id],
      jsonb_build_array(jsonb_build_object('id',first_item,'name','Preview reel','date',null),jsonb_build_object('id',second_item,'name','Photographs','date','2026-12-12')),owner_id,owner_id)
    returning id into j;
  set constraints "website-jobs-auto-deliverable-tasks" immediate;
  assert (select count(*)=2 from public."website-job-tasks" where job_id=j), 'Save did not automatically create both tasks';
  select id into first_task from public."website-job-tasks" where job_id=j and source_deliverable_id=first_item;
  select id into second_task from public."website-job-tasks" where job_id=j and source_deliverable_id=second_item;
  assert (select due_date='2026-12-15' and not due_date_is_override and assignee_ids=array[owner_id] from public."website-job-tasks" where id=first_task), 'Job deadline/assignment not inherited';
  assert (select due_date='2026-12-12' and due_date_is_override from public."website-job-tasks" where id=second_task), 'Deliverable date not respected';
  update public."website-job-tasks" set status_id=done_status,hours=3.5,description='Keep these existing notes' where id=first_task;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,j,initial_status,'Preview reel') returning id into manual_task;
  update public."website-jobs" set deliverables=jsonb_set(deliverables,'{0,name}','"Renamed preview"') where id=j;
  assert (select title='Renamed preview' and status_id=done_status and hours=3.5 and description='Keep these existing notes' from public."website-job-tasks" where id=first_task), 'Rename replaced task identity/progress/notes';
  assert (select title='Preview reel' from public."website-job-tasks" where id=manual_task), 'Unlinked task was renamed by name';
  update public."website-jobs" set deliverables=deliverables,due_date='2026-12-16' where id=j;
  assert (select count(*)=3 from public."website-job-tasks" where job_id=j), 'Repeat save duplicated tasks';
  assert (select due_date='2026-12-12' from public."website-job-tasks" where id=second_task), 'Explicit deadline overwritten';
  update public."website-job-tasks" set archived_at=now() where id=second_task;
  update public."website-jobs" set deliverables=deliverables || jsonb_build_array(jsonb_build_object('id',third_item,'name','Undated asset','date',null)),due_date=null where id=j;
  assert (select count(*)=4 from public."website-job-tasks" where job_id=j), 'Archived deliverable recreated or new item missing';
  assert (select due_date is null from public."website-job-tasks" where job_id=j and source_deliverable_id=third_item), 'Missing date should stay unset';
  insert into public."website-jobs"(workspace_id,status_id,title,assignee_ids,deliverables)
    values(w,planned,'QA rollback unrelated client',array[owner_id],jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Unrelated','date',null))) returning id into other_job;
  assert not exists(select 1 from public."website-job-tasks" where job_id=other_job), 'Unrelated client automatically changed';
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids,deliverables)
    values(w,c,delivered,'QA rollback completed job',array[owner_id],jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Historic','date',null))) returning id into closed_job;
  assert not exists(select 1 from public."website-job-tasks" where job_id=closed_job), 'Closed job gained new outstanding tasks';
  -- Explicit clone/reschedule copies win before deferred automatic generation.
  set constraints "website-jobs-auto-deliverable-tasks" deferred;
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids,deliverables)
    values(w,c,planned,'QA rollback clone',array[owner_id],jsonb_build_array(jsonb_build_object('id',first_item,'name','Renamed preview','date',null))) returning id into clone_job;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title,source_deliverable_id,hours)
    values(w,clone_job,done_status,'Existing explicit copy',first_item,7) returning id into copied_task;
  set constraints "website-jobs-auto-deliverable-tasks" immediate;
  assert (select count(*)=1 from public."website-job-tasks" where job_id=clone_job), 'Explicit clone copy duplicated';
  assert (select title='Existing explicit copy' and hours=7 and status_id=done_status from public."website-job-tasks" where id=copied_task), 'Automatic generation overwrote copied progress';
  -- Existing progress triggers and new detail trigger coalesce into one queue.
  update public."website-clickup-integrations" set sync_subtasks=true,subtask_lease_token=null,subtask_lease_until=null where workspace_id=w;
  update public."website-clickup-sync-outbox" set status='completed',completed_at=now() where job_id=j;
  update public."website-job-tasks" set title='Changed child detail' where id=first_task;
  assert (select count(*)=1 from public."website-clickup-sync-outbox" where job_id=j and status='pending'), 'Child rename did not queue sync';
  update public."website-job-tasks" set hours=4 where id=first_task;
  assert (select count(*)=1 from public."website-clickup-sync-outbox" where job_id=j and status='pending'), 'Detail changes did not coalesce';
  assert public."website-clickup-subtask-lease"(w,token,'claim'), 'Initial lease claim failed';
  assert not public."website-clickup-subtask-lease"(w,other_token,'claim'), 'Concurrent lease claim succeeded';
  assert not public."website-clickup-subtask-lease"(w,other_token,'release'), 'Wrong token released lease';
  assert public."website-clickup-subtask-lease"(w,token,'renew'), 'Lease renewal failed';
  assert public."website-clickup-subtask-lease"(w,token,'release'), 'Lease release failed';
  assert not has_table_privilege('authenticated','public."website-clickup-subtask-links"','SELECT'), 'Client can read private mapping';
  assert not has_table_privilege('anon','public."website-clickup-subtask-links"','INSERT'), 'Anonymous can mutate mappings';
  assert not has_function_privilege('authenticated','public."website-clickup-subtask-lease"(uuid,uuid,text)','EXECUTE'), 'Client can seize worker lease';
  assert not has_function_privilege('authenticated','"website-private"."website-auto-job-deliverable-tasks"()','EXECUTE'), 'Client can invoke privileged trigger';
end $verify$;
select 'PASS: automatic creation, stable renames, preserved progress/hours/notes, deadlines, repeat saves, archived tasks, client scope, deferred clones, queue coalescing, exclusive leases and private permissions. All fixtures rolled back.' as verification;
rollback;
