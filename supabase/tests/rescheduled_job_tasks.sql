-- Real-schema / real authenticated role verification. No fixtures or queues survive.
begin;
set local statement_timeout='20s';
select set_config('request.jwt.claims','{"sub":"d61eb1c9-8a31-4c49-81fd-93dd478493ce","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $verify$
declare
  w uuid:='11111111-1111-4111-8111-111111111111'; actor uuid:=auth.uid(); client uuid;
  scheduled uuid; production uuid; delayed uuid; editing uuid; review_task uuid; done uuid;
  j uuid; next_job uuid; final_job uuid; manual_job uuid; manual_next uuid; manual_final uuid; standalone uuid; standalone_next uuid; own_later uuid;
  first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid(); archived_id uuid:=gen_random_uuid(); a uuid; b uuid; c uuid; d uuid;
  note_id uuid; before_rows jsonb; after_rows jsonb; rejected boolean:=false; total_before integer;
begin
  select id into client from public."website-clients" where workspace_id=w and lower(name)='autopacific group';
  select id into scheduled from public."website-job-statuses" where workspace_id=w and key='scheduled';
  select id into production from public."website-job-statuses" where workspace_id=w and key='production';
  select id into delayed from public."website-job-statuses" where workspace_id=w and key='delayed';
  select id into editing from public."website-task-statuses" where workspace_id=w and key='in_progress';
  select id into review_task from public."website-task-statuses" where workspace_id=w and key='final_draft_notes';
  select id into done from public."website-task-statuses" where workspace_id=w and key='posted_done';
  assert client is not null and actor is not null,'Test account/client is unavailable';
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,shoot_date,due_date,assignee_ids,deliverables)
    values(w,client,scheduled,'QA rollback: reschedule retains task identities','2026-12-01','2026-12-09',array[actor],
      jsonb_build_array(jsonb_build_object('id',first_id,'name','Completed photographs','date','2026-12-05'),
        jsonb_build_object('id',second_id,'name','Reviewed film','date','2026-12-06'),
        jsonb_build_object('id',archived_id,'name','Archived asset stays archived','date','2026-12-03'))) returning id into j;
  set constraints public."website-jobs-auto-deliverable-tasks" immediate;
  select id into a from public."website-job-tasks" where job_id=j and source_deliverable_id=first_id;
  select id into b from public."website-job-tasks" where job_id=j and source_deliverable_id=second_id;
  update public."website-job-tasks" set status_id=done,completed_at='2026-12-02T10:00:00Z',hours=2.75,
    description='Preserve completed work',external_url='https://example.com/completed',approved_at='2026-12-02T11:00:00Z',approved_by=actor where id=a;
  update public."website-job-tasks" set status_id=review_task,hours=3.5,description='Preserve review notes',due_time='14:30' where id=b;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title,hours,due_date,due_date_is_override,description,assignee_ids)
    values(w,j,editing,'Manual asset not in the deliverables list',1.25,'2026-12-09',false,'Keep all my details',array[actor]) returning id into c;
  select id into d from public."website-job-tasks" where job_id=j and source_deliverable_id=archived_id;
  update public."website-job-tasks" set status_id=editing,hours=4,archived_at=now() where id=d;
  insert into public."website-work-record-notes"(workspace_id,record_kind,task_id,body,created_by,updated_by)
    values(w,'task',a,'A task comment that must remain on the same task',actor,actor) returning id into note_id;
  select jsonb_object_agg(id::text,to_jsonb(t)-array['job_id','due_date','updated_at','updated_by']) into before_rows
    from public."website-job-tasks" t where job_id=j;
  -- The RPC must work even though the caller currently has constraints immediate.
  select successor_job_id into next_job from public."website-delay-job"(j,'2026-12-04','First test delay');
  set constraints public."website-jobs-auto-deliverable-tasks" immediate;
  select jsonb_object_agg(id::text,to_jsonb(t)-array['job_id','due_date','updated_at','updated_by']) into after_rows
    from public."website-job-tasks" t where job_id=next_job;
  assert before_rows=after_rows,'Task IDs, progress, hours, notes, approval, assignment or other fields changed';
  assert not exists(select 1 from public."website-job-tasks" where job_id=j),'Original tasks were not transferred';
  assert (select status_id=delayed from public."website-jobs" where id=j),'Original job is not Delayed';
  assert (select status_id=production from public."website-jobs" where id=next_job),'Successor lost task-driven progress';
  assert (select count(*)=4 from public."website-job-tasks" where job_id=next_job),'Deliverable generator created duplicates';
  assert (select due_date='2026-12-05' and completed_at='2026-12-02T10:00:00Z'::timestamptz from public."website-job-tasks" where id=a),'Completed date/history changed';
  assert (select due_date='2026-12-09' and due_time='14:30'::time from public."website-job-tasks" where id=b),'Explicit pending deadline was not shifted';
  assert (select due_date='2026-12-12' from public."website-job-tasks" where id=c),'Inherited pending deadline did not follow new job';
  assert (select archived_at is not null and due_date='2026-12-03' from public."website-job-tasks" where id=d),'Archived work was reactivated or redated';
  assert (select task_id=a from public."website-work-record-notes" where id=note_id),'Task comment was orphaned or copied';
  assert (select item->>'date'='2026-12-09' from public."website-jobs",jsonb_array_elements(deliverables) item where id=next_job and item->>'id'=second_id::text),'Dated deliverable list is inconsistent';

  select successor_job_id into final_job from public."website-delay-job"(next_job,'2026-12-10','Second test delay');
  set constraints public."website-jobs-auto-deliverable-tasks" immediate;
  select jsonb_object_agg(id::text,to_jsonb(t)-array['job_id','due_date','updated_at','updated_by']) into after_rows
    from public."website-job-tasks" t where job_id=final_job;
  assert before_rows=after_rows,'Second reschedule reset task identities/details';
  assert (select count(*)=2 from public."website-job-delay-history" where source_job_id in (j,next_job)),'Delay chain was lost';
  assert (select due_date='2026-12-15' from public."website-job-tasks" where id=b),'Second reschedule did not shift pending explicit date';
  assert (select due_date='2026-12-18' from public."website-job-tasks" where id=c),'Second reschedule lost inherited date';
  assert (select due_date='2026-12-05' from public."website-job-tasks" where id=a),'Second reschedule changed completed history';
  select count(*) into total_before from public."website-jobs" where title='QA rollback: reschedule retains task identities';
  begin perform public."website-delay-job"(j,'2026-12-20','Repeated stale request'); exception when raise_exception then rejected:=true; end;
  assert rejected,'Stale reschedule was accepted';
  assert (select count(*)=total_before from public."website-jobs" where title='QA rollback: reschedule retains task identities'),'Stale request duplicated a job';

  -- ROLA-style jobs: zero saved deliverables, completed and open manual tasks.
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,shoot_date,due_date,assignee_ids)
    values(w,client,scheduled,'QA rollback: manual-only tasks','2026-12-01','2026-12-09',array[actor]) returning id into manual_job;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title,completed_at)
    values(w,manual_job,done,'Completed manual asset',now()) returning id into a;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title,hours)
    values(w,manual_job,editing,'Open manual asset',6.25) returning id into b;
  select successor_job_id into manual_next from public."website-delay-job"(manual_job,'2026-12-04','Manual-only test');
  set constraints public."website-jobs-auto-deliverable-tasks" immediate;
  assert (select count(*)=2 from public."website-job-tasks" where job_id=manual_next and id in (a,b)),'Manual-only tasks did not move';
  assert (select status_id=done and completed_at is not null from public."website-job-tasks" where id=a),'Completed manual task was reset';
  assert (select hours=6.25 and status_id=editing from public."website-job-tasks" where id=b),'Open manual task details changed';
  select successor_task_id into own_later from public."website-delay-task"(b,'2026-12-22','An independently chosen task deadline');
  select successor_job_id into manual_final from public."website-delay-job"(manual_next,'2026-12-10','Parent delayed again');
  set constraints public."website-jobs-auto-deliverable-tasks" immediate;
  assert (select job_id=manual_final and due_date='2026-12-22' from public."website-job-tasks" where id=own_later),'Parent reschedule overwrote a separate task reschedule';
  assert exists(select 1 from public."website-task-delay-history" where source_task_id=b and successor_task_id=own_later),'Task delay history lost';
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids)
    values(w,client,scheduled,'QA rollback: standalone delay',array[actor]) returning id into standalone;
  select successor_job_id into standalone_next from public."website-delay-job"(standalone,'2026-12-04','No tasks to move');
  assert (select count(*)=0 from public."website-job-tasks" where job_id=standalone_next),'Standalone delay invented tasks';
  assert (select status_id=scheduled from public."website-jobs" where id=standalone_next),'Standalone successor status changed';

  assert not has_function_privilege('anon','public."website-delay-job"(uuid,date,text)','EXECUTE'),'Anonymous delay RPC access';
  assert not has_function_privilege('authenticated','"website-private"."website-transfer-rescheduled-job-tasks"(uuid,uuid,uuid)','EXECUTE'),'Private transfer helper exposed';
  assert not has_function_privilege('service_role','"website-private"."website-transfer-rescheduled-job-tasks"(uuid,uuid,uuid)','EXECUTE'),'Private helper unnecessarily granted to API service role';
  perform set_config('qa.rescheduled_job_ids',jsonb_build_array(j,next_job,final_job,manual_job,manual_next,manual_final,standalone,standalone_next)::text,true);
  rejected:=false;
  perform set_config('request.jwt.claims','{"role":"authenticated","aal":"aal2"}',true);
  begin perform public."website-delay-job"(final_job,'2026-12-20','No signed-in identity'); exception when raise_exception then rejected:=true; end;
  assert rejected,'Missing identity could reschedule a job';
end $verify$;
reset role;
-- Outboxes deliberately have no authenticated SELECT policy. Verify them as
-- their actual service/owner, without weakening RLS just to inspect the test.
do $queues$
declare j uuid;
begin
  for j in select value::uuid from jsonb_array_elements_text(current_setting('qa.rescheduled_job_ids')::jsonb) loop
    assert (select count(*)=1 from public."website-clickup-sync-outbox" where job_id=j and status in ('pending','retry')),'Affected ClickUp parent not queued exactly once';
  end loop;
end $queues$;
select 'PASS: original task identities and all details, completed/archived records, manual and generated deliverables, repeated delays, task-driven progress, safe deadlines, comments, ClickUp queues and authenticated permissions. All fixtures rolled back.' as verification;
rollback;
