-- Fixtures, generated tasks and ClickUp queue entries are always rolled back.
begin;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub','d61eb1c9-8a31-4c49-81fd-93dd478493ce','role','authenticated')::text, true);
do $$
declare
  workspace uuid := '11111111-1111-4111-8111-111111111111'; client uuid;
  job uuid; successor uuid; result record; brief jsonb;
  first_id uuid := gen_random_uuid(); second_id uuid := gen_random_uuid(); rejected boolean := false;
begin
  client := "website-private"."website-autopacific-client-id"(workspace);
  brief := jsonb_build_array(jsonb_build_object('id',first_id,'name','Launch reel','date','2026-11-13'), jsonb_build_object('id',second_id,'name','Photographs','date',null));
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,deliverables)
  select workspace,client,id,'QA rollback: dated deliverables',brief from public."website-job-statuses" where key='planning' and workspace_id=workspace returning id into job;
  assert (select shoot_date is null and due_date is null from public."website-jobs" where id=job), 'Planning unexpectedly requires dates';
  assert (select key_deliverables from public."website-jobs" where id=job)=array['Launch reel','Photographs'], 'Legacy brief not mirrored';
  select * into result from public."website-create-deliverable-tasks"(job);
  assert result.created_count=2 and result.existing_count=0, 'Did not create one task per deliverable';
  assert (select due_date from public."website-job-tasks" where job_id=job and source_deliverable_id=first_id)='2026-11-13'::date, 'Explicit deliverable deadline lost';
  assert (select due_date from public."website-job-tasks" where job_id=job and source_deliverable_id=second_id) is null, 'Invented a deadline for undated planning work';
  select * into result from public."website-create-deliverable-tasks"(job);
  assert result.created_count=0 and result.existing_count=2, 'Repeated click duplicated tasks';
  update public."website-jobs" set due_date='2026-11-20' where id=job;
  assert (select due_date from public."website-job-tasks" where job_id=job and source_deliverable_id=first_id)='2026-11-13'::date, 'Parent edit overwrote specific deadline';
  assert (select due_date from public."website-job-tasks" where job_id=job and source_deliverable_id=second_id)='2026-11-20'::date, 'Undated deliverable did not inherit job deadline';
  brief := jsonb_set(brief,'{0,date}','"2026-11-16"'::jsonb);
  update public."website-jobs" set deliverables=brief where id=job;
  assert (select due_date from public."website-job-tasks" where job_id=job and source_deliverable_id=first_id)='2026-11-16'::date, 'Updated deliverable date did not reach linked task';
  select successor_job_id into successor from public."website-delay-job"(job,'2026-11-23','Waiting for samples');
  assert (select deliverables from public."website-jobs" where id=successor)=brief, 'Reschedule lost dated deliverables';
  begin
    update public."website-jobs" set deliverables=jsonb_build_array(brief->0,brief->0) where id=successor;
  exception when check_violation then rejected := true;
  end;
  assert rejected, 'Duplicate deliverable IDs allowed';
  rejected := false;
  begin perform * from public."website-create-deliverable-tasks"(gen_random_uuid());
  exception when raise_exception then rejected := true;
  end;
  assert rejected, 'Unavailable job should not generate tasks';
end $$;
select 'Undated planning, dated task generation, idempotency, deadline inheritance and rescheduling passed' as verification;
rollback;
