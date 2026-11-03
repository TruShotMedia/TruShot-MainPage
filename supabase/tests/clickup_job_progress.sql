-- Temporary fixtures and queue changes are rolled back; no external requests.
begin;
select set_config('request.jwt.claims', '{"sub":"d61eb1c9-8a31-4c49-81fd-93dd478493ce","role":"authenticated","aal":"aal2"}', true);
do $verify$
declare
 w uuid := '11111111-1111-4111-8111-111111111111';
 owner_id uuid := 'd61eb1c9-8a31-4c49-81fd-93dd478493ce';
 c uuid; a uuid; b uuid; other_job uuid; t uuid; planned uuid; initial_status uuid; done_status uuid;
begin
 select target_client_id into c from public."website-clickup-integrations" where workspace_id=w and enabled;
 select id into planned from public."website-job-statuses" where workspace_id=w and key='planning';
 select id into initial_status from public."website-task-statuses" where workspace_id=w and key='not_started';
 select id into done_status from public."website-task-statuses" where workspace_id=w and key='posted_done';
 insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids) values(w,c,planned,'QA rollback progress A',array[owner_id]) returning id into a;
 insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids) values(w,c,planned,'QA rollback progress B',array[owner_id]) returning id into b;
 insert into public."website-jobs"(workspace_id,status_id,title,assignee_ids) values(w,planned,'QA rollback other client',array[owner_id]) returning id into other_job;
 update public."website-clickup-sync-outbox" set status='completed',completed_at=now() where job_id in(a,b,other_job);
 insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,a,initial_status,'QA rollback deliverable') returning id into t;
 assert (select count(*)=1 from public."website-clickup-sync-outbox" where job_id=a and status='pending'), 'Task creation did not queue parent';
 update public."website-job-tasks" set status_id=done_status where id=t;
 assert (select count(*)=1 from public."website-clickup-sync-outbox" where job_id=a and status='pending'), 'Updates did not coalesce';
 update public."website-clickup-sync-outbox" set status='completed',completed_at=now() where job_id=a;
 update public."website-job-tasks" set title='QA rollback rename' where id=t;
 assert not exists(select 1 from public."website-clickup-sync-outbox" where job_id=a and status='pending'), 'Irrelevant edit queued progress';
 update public."website-job-tasks" set job_id=b where id=t;
 assert (select count(*)=2 from public."website-clickup-sync-outbox" where job_id in(a,b) and status='pending'), 'Reparent did not queue both parents';
 update public."website-clickup-sync-outbox" set status='completed',completed_at=now() where job_id in(a,b);
 update public."website-job-tasks" set archived_at=now() where id=t;
 assert exists(select 1 from public."website-clickup-sync-outbox" where job_id=b and status='pending'), 'Archive did not queue parent';
 update public."website-clickup-sync-outbox" set status='completed',completed_at=now() where job_id=b;
 update public."website-job-tasks" set archived_at=null,status_id=initial_status where id=t;
 assert exists(select 1 from public."website-clickup-sync-outbox" where job_id=b and status='pending'), 'Restore did not queue parent';
 insert into public."website-job-tasks"(workspace_id,job_id,status_id,title) values(w,other_job,initial_status,'QA rollback unrelated task');
 assert not exists(select 1 from public."website-clickup-sync-outbox" where job_id=other_job and status='pending'), 'Unrelated client queued';
 assert not has_function_privilege('anon','"website-private"."website-queue-clickup-task-progress"()','EXECUTE'), 'Public execute grant present';
 assert not has_function_privilege('authenticated','"website-private"."website-queue-clickup-task-progress"()','EXECUTE'), 'Authenticated execute grant present';
end $verify$;
select 'Progress queue create, completion, coalescing, rename suppression, reparent, archive, restore, client scope and private permissions passed; transaction rolled back.' as verification;
rollback;
