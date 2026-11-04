-- Existing Marketing user: test actual RLS, not a privileged approximation.
-- Every fixture is rolled back; no existing record is edited.
begin;
select set_config('request.jwt.claims', '{"sub":"938e5a99-a7e2-43f5-9d1c-f3e9d7e5aafc","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $verify$
declare
  w uuid := '11111111-1111-4111-8111-111111111111';
  john uuid := 'd61eb1c9-8a31-4c49-81fd-93dd478493ce';
  client uuid; planned uuid; j uuid; item uuid := gen_random_uuid(); t uuid; affected integer;
begin
  select id into client from public."website-clients" where workspace_id=w and lower(btrim(name))='autopacific group' and archived_at is null limit 1;
  select id into planned from public."website-job-statuses" where workspace_id=w and key='planning';
  assert client is not null and planned is not null, 'Marketing cannot access required parent scope';
  insert into public."website-jobs"(workspace_id,client_id,status_id,title,assignee_ids,deliverables,created_by,updated_by)
    values(w,client,planned,'QA rollback Marketing automatic assets',array[john],jsonb_build_array(jsonb_build_object('id',item,'name','Marketing brief reel','date',null)),auth.uid(),auth.uid()) returning id into j;
  set constraints "website-jobs-auto-deliverable-tasks" immediate;
  select id into t from public."website-job-tasks" where job_id=j and source_deliverable_id=item;
  assert t is not null, 'Marketing save did not create the videographer task';
  assert (select assignee_ids=array[john] from public."website-job-tasks" where id=t), 'Task assignment did not follow parent';
  update public."website-jobs" set deliverables=jsonb_set(deliverables,'{0,name}','"Updated Marketing reel"'),due_date='2026-12-22',updated_by=auth.uid() where id=j;
  assert (select title='Updated Marketing reel' and due_date='2026-12-22' from public."website-job-tasks" where id=t), 'Marketing-authorized brief rename/deadline failed';
  update public."website-job-tasks" set title='Direct forbidden task edit' where id=t;
  get diagnostics affected = row_count;
  assert affected=0, 'Marketing unexpectedly gained direct edit permission on videographer assets';
end $verify$;
reset role;
select 'PASS: authenticated Marketing can create/rename deliverable-linked assets through authorized job saves, but cannot directly edit videographer tasks. Fixtures rolled back.' as verification;
rollback;
