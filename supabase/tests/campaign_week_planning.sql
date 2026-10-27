-- Rollback-only integration checks. No test records or ClickUp outbox events persist.
begin;
do $$ declare actor uuid; begin
  select user_id into actor from public."website-portal-users" where portal_key='autopacific' and is_active limit 1;
  if actor is null then raise exception 'AutoPacific test actor unavailable'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare
  workspace uuid := '11111111-1111-4111-8111-111111111111';
  client uuid; stage uuid; campaign uuid:=gen_random_uuid(); week1 uuid:=gen_random_uuid(); week2 uuid:=gen_random_uuid();
  job1 uuid:=gen_random_uuid(); job2 uuid:=gen_random_uuid(); item1 uuid:=gen_random_uuid(); item2 uuid:=gen_random_uuid();
  plan jsonb; saved_at timestamptz; job_saved_at timestamptz; result record; blocked boolean;
begin
  select id into client from public."website-clients" where workspace_id=workspace and name='Autopacific Group' and archived_at is null;
  select id into stage from public."website-job-statuses" where workspace_id=workspace and key='planning';
  plan:=jsonb_build_object('id',campaign,'title','QA rollback campaign','start_date','2026-12-30','updated_at',null,'weeks',jsonb_build_array(
    jsonb_build_object('id',week1,'title','Teaser','jobs',jsonb_build_array(jsonb_build_object('id',job1,'title','QA teaser','status_id',stage,'shoot_date',null,'due_date','2027-01-02','updated_at',null,
      'deliverables',jsonb_build_array(jsonb_build_object('id',item1,'name','Preview reel','date',null),jsonb_build_object('id',item2,'name','Stills','date','2027-01-01'))))),
    jsonb_build_object('id',week2,'title','Episode','jobs',jsonb_build_array(jsonb_build_object('id',job2,'title','QA episode','status_id',stage,'shoot_date',null,'due_date',null,'updated_at',null,'deliverables','[]'::jsonb)))
  ));
  perform public."website-save-campaign-plan"(workspace,client,plan);
  assert (select count(*) from public."website-campaign-weeks" where campaign_id=campaign)=2, 'Two saved weeks';
  assert (select due_date from public."website-campaigns" where id=campaign)='2027-01-12'::date, 'Inclusive week dates';
  assert (select count(*) from public."website-jobs" where campaign_week_id in (week1,week2))=2, 'Real jobs linked';
  select * into result from public."website-create-deliverable-tasks"(job1);
  assert result.created_count=2, 'Generate deliverables';
  assert (select due_date from public."website-job-tasks" where job_id=job1 and source_deliverable_id=item1)='2027-01-02'::date, 'Job due date fallback';
  assert (select due_date from public."website-job-tasks" where job_id=job1 and source_deliverable_id=item2)='2027-01-01'::date, 'Explicit deliverable date';
  select * into result from public."website-create-deliverable-tasks"(job1);
  assert result.created_count=0 and result.existing_count=2, 'Task generation is idempotent';
  select updated_at into saved_at from public."website-campaigns" where id=campaign;
  select updated_at into job_saved_at from public."website-jobs" where id=job1;
  plan:=jsonb_set(plan,'{updated_at}',to_jsonb(saved_at));
  plan:=jsonb_set(plan,'{weeks,0,jobs,0,updated_at}',to_jsonb(job_saved_at));
  plan:=jsonb_set(plan,'{weeks,1,jobs,0,updated_at}',to_jsonb((select updated_at from public."website-jobs" where id=job2)));
  update public."website-jobs" set notes='Retain operational notes' where id=job1;
  plan:=jsonb_set(plan,'{weeks,0,jobs,0,due_date}','"2027-01-03"');
  perform public."website-save-campaign-plan"(workspace,client,plan);
  assert (select due_date from public."website-job-tasks" where job_id=job1 and source_deliverable_id=item1)='2027-01-03'::date, 'Generated tasks follow updated job deadlines';
  assert (select due_date from public."website-job-tasks" where job_id=job1 and source_deliverable_id=item2)='2027-01-01'::date, 'Explicit deadlines remain explicit';
  assert (select notes from public."website-jobs" where id=job1)='Retain operational notes', 'Notes are never overwritten by the campaign editor';

  blocked:=false;
  begin
    perform public."website-save-campaign-plan"(workspace,client,jsonb_set(plan,'{weeks,0,jobs,0,updated_at}',to_jsonb(saved_at-interval '1 day')));
  exception when others then blocked:=position('changed elsewhere' in sqlerrm)>0; end;
  assert blocked, 'Stale child edits are rejected';
  blocked:=false;
  begin
    perform public."website-save-campaign-plan"(workspace,client,jsonb_set(plan,'{updated_at}',to_jsonb(saved_at-interval '1 day')));
  exception when others then blocked:=position('changed elsewhere' in sqlerrm)>0; end;
  assert blocked, 'Stale campaign edits are rejected';
  -- A failed second child must roll back the valid parent/first child too.
  blocked:=false;
  begin
    perform public."website-save-campaign-plan"(workspace,client,jsonb_set(jsonb_set(plan,'{title}','"Should never persist"'),'{weeks,1,jobs,0,status_id}',to_jsonb(gen_random_uuid())));
  exception when others then blocked:=true; end;
  assert blocked and (select title from public."website-campaigns" where id=campaign)='QA rollback campaign', 'Atomic rollback';

  plan:=jsonb_set(plan,'{weeks}',jsonb_build_array(plan->'weeks'->0));
  perform public."website-save-campaign-plan"(workspace,client,plan);
  assert exists(select 1 from public."website-jobs" where id=job2 and campaign_week_id is null and archived_at is null), 'Week removal preserves jobs';
  assert (select count(*) from public."website-job-tasks" where job_id=job1)=2, 'Tasks remain linked';
  select * into result from public."website-delay-job"(job1,'2027-01-04'::date,'QA weather delay');
  assert (select campaign_week_id from public."website-jobs" where id=result.successor_job_id)=week1, 'Reschedule successor retains its campaign week';
  assert (select s.key from public."website-jobs" j join public."website-job-statuses" s on s.id=j.status_id where j.id=job1)='delayed', 'Old campaign job marked delayed';
  assert not exists(select 1 from public."website-campaigns" where client_id<>client), 'Portal campaigns isolated';
end $$;
rollback;
select 'Campaign save, dates, tasks, idempotency, stale protection, rollback and safe week removal passed. All fixtures rolled back.' as result;
