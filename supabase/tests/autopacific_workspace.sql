-- Run against the migrated schema. Every fixture and outbox change rolls back.
begin;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', 'd61eb1c9-8a31-4c49-81fd-93dd478493ce', 'role', 'authenticated')::text, true);

do $$
declare
  workspace uuid := '11111111-1111-4111-8111-111111111111';
  client uuid;
  job uuid;
  successor uuid;
  latest_job uuid;
  task uuid;
  next_task uuid;
  status uuid;
  denied boolean := false;
begin
  client := "website-private"."website-autopacific-client-id"(workspace);
  assert client is not null, 'Portal membership/client is missing';
  assert not "website-private"."website-has-workspace-access"(workspace), 'Portal user gained CRM access';
  assert (select count(*) from public."website-admin-users") = 0, 'Admin membership exposed';
  assert (select count(*) from public."website-invoices") = 0, 'Invoices exposed';
  assert (select count(*) from public."website-enquiries") = 0, 'Client requests exposed';
  assert (select count(*) from public."website-clients") = 1, 'Other clients exposed';
  assert not exists (select 1 from public."website-jobs" where client_id is distinct from client), 'Other jobs exposed';
  assert not exists (select 1 from public."website-calendar-events" where client_id is distinct from client), 'Other events exposed';
  assert not exists (select 1 from public."website-flight-events" where client_id is distinct from client), 'Other flights exposed';
  assert (select count(*) from public."website-job-statuses") > 0, 'Status choices unavailable';
  assert (select count(*) from public."website-weather-snapshots") > 0, 'Weather unavailable';

  select id into status from public."website-job-statuses" where key = 'scheduled' and workspace_id = workspace;
  insert into public."website-jobs" (workspace_id, client_id, status_id, title, shoot_date, due_date, notes, photos_delivered, key_deliverables)
  values (workspace, client, status, 'QA rollback: reschedule', '2026-10-28', '2026-10-30', 'Original internal note', 17, array['Launch reel','5 photographs']) returning id into job;
  insert into public."website-work-record-notes" (workspace_id, record_kind, job_id, body)
  values (workspace, 'job', job, 'Operational note added later');
  select successor_job_id into successor from public."website-delay-job"(job, '2026-11-02', 'Weather prevented capture');
  assert (select s.key from public."website-jobs" j join public."website-job-statuses" s on s.id = j.status_id where j.id = job) = 'delayed', 'Source not delayed';
  assert (select key_deliverables from public."website-jobs" where id = successor) = array['Launch reel','5 photographs'], 'Deliverables lost';
  assert (select count(*) from public."website-work-record-notes" where job_id = successor and body in ('Original internal note','Operational note added later','Weather prevented capture')) = 3, 'Source notes/reason missing';
  select successor_job_id into latest_job from public."website-delay-job"(successor, '2026-11-06', 'Location unavailable');
  assert (select count(*) from public."website-work-record-notes" where job_id = latest_job and body in ('Weather prevented capture','Location unavailable')) = 2, 'Repeated delay lost earlier reason';
  assert (select photos_delivered from public."website-jobs" where id = job) = 17, 'Photo history overwritten';

  select id into status from public."website-task-statuses" where key = 'not_started' and workspace_id = workspace;
  insert into public."website-job-tasks" (workspace_id, job_id, status_id, title, due_date)
  values (workspace, latest_job, status, 'QA rollback: task', '2026-11-06') returning id into task;
  select successor_task_id into next_task from public."website-delay-task"(task, '2026-11-10', 'Waiting on approval');
  assert (select count(*) from public."website-work-record-notes" where task_id in (task, next_task) and body = 'Waiting on approval') = 2, 'Task reason missing';

  begin
    insert into public."website-jobs" (workspace_id, client_id, status_id, title)
    select workspace, null, id, 'QA forbidden client' from public."website-job-statuses" limit 1;
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'Portal could create an unscoped job';
end $$;

reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', '3ccfc0e7-254e-4cbe-8b86-4bb8063d1220', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  assert "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'), 'Existing owner access broken';
  assert (select count(*) from public."website-clients") > 1, 'Owner client access regressed';
end $$;
select 'AutoPacific isolation, jobs/tasks, repeated reschedules, notes, deliverables, weather and owner access passed' as verification;
rollback;
