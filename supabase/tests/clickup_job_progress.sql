-- All fixtures and outbox changes roll back; no ClickUp HTTP requests are made.
begin;
select set_config('request.jwt.claims', '{"sub":"d61eb1c9-8a31-4c49-81fd-93dd478493ce","role":"authenticated","aal":"aal2"}', true);
do $$
declare
  workspace uuid := '11111111-1111-4111-8111-111111111111';
  owner_id uuid := 'd61eb1c9-8a31-4c49-81fd-93dd478493ce';
  client uuid; first_job uuid; second_job uuid; unrelated uuid; task uuid;
  planning uuid; not_started uuid; done uuid;
begin
  select target_client_id into client from public."website-clickup-integrations" where workspace_id=workspace and enabled;
  assert client is not null, 'Fixture requires the existing enabled integration';
  select id into planning from public."website-job-statuses" where workspace_id=workspace and key='planning';
  select id into not_started from public."website-task-statuses" where workspace_id=workspace and key='not_started';
  select id into done from public."website-task-statuses" where workspace_id=workspace and key='posted_done';
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids)
    values(workspace,client,planning,'QA rollback: progress A',array[owner_id]) returning id into first_job;
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids)
    values(workspace,client,planning,'QA rollback: progress B',array[owner_id]) returning id into second_job;
  insert into public."website-jobs"(workspace_id,status_id,title,assignee_ids)
    values(workspace,planning,'QA rollback: other client',array[owner_id]) returning id into unrelated;
  delete from public."website-clickup-sync-outbox" where job_id in(first_job,second_job,unrelated);
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title)
    values(workspace,first_job,not_started,'QA rollback: deliverable') returning id into task;
  assert (select count(*)=1 from public."website-clickup-sync-outbox" where job_id=first_job and status='pending'), 'Create did not queue parent';
  update public."website-job-tasks" set status_id=done where id=task;
  assert (select count(*)=1 from public."website-clickup-sync-outbox" where job_id=first_job and status='pending'), 'Repeated updates were not coalesced';
  delete from public."website-clickup-sync-outbox" where job_id=first_job;
  update public."website-job-tasks" set title='QA rollback: renamed only' where id=task;
  assert not exists(select 1 from public."website-clickup-sync-outbox" where job_id=first_job), 'Unrelated title edit queued progress';
  update public."website-job-tasks" set job_id=second_job where id=task;
  assert (select count(*)=2 from public."website-clickup-sync-outbox" where job_id in(first_job,second_job) and status='pending'), 'Reparent did not refresh both jobs';
  delete from public."website-clickup-sync-outbox" where job_id in(first_job,second_job);
  update public."website-job-tasks" set archived_at=now() where id=task;
  assert exists(select 1 from public."website-clickup-sync-outbox" where job_id=second_job), 'Archive did not refresh parent';
  delete from public."website-clickup-sync-outbox" where job_id=second_job;
  update public."website-job-tasks" set archived_at=null where id=task;
  assert exists(select 1 from public."website-clickup-sync-outbox" where job_id=second_job), 'Restore did not refresh parent';
  delete from public."website-clickup-sync-outbox" where job_id=second_job;
  delete from public."website-job-tasks" where id=task;
  assert exists(select 1 from public."website-clickup-sync-outbox" where job_id=second_job), 'Delete did not refresh parent';
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title)
    values(workspace,unrelated,not_started,'QA rollback: unrelated task');
  assert not exists(select 1 from public."website-clickup-sync-outbox" where job_id=unrelated), 'Unrelated client leaked into sync';
  update public."website-jobs" set archived_at=now() where id=first_job;
  delete from public."website-clickup-sync-outbox" where job_id=first_job;
  insert into public."website-job-tasks"(workspace_id,job_id,status_id,title)
    values(workspace,first_job,not_started,'QA rollback: archived parent');
  assert not exists(select 1 from public."website-clickup-sync-outbox" where job_id=first_job), 'Archived parent was resurrected';
  assert not has_function_privilege('authenticated','"website-private"."website-queue-clickup-task-progress"()','EXECUTE'), 'Trigger became an authenticated RPC';
  assert not has_function_privilege('anon','"website-private"."website-queue-clickup-task-progress"()','EXECUTE'), 'Trigger became a public RPC';
end $$;
select 'ClickUp task progress queue: create, complete, coalesce, reparent, archive, restore, delete and scope checks passed' as verification;
rollback;
