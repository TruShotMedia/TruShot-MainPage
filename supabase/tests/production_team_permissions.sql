-- Transaction-only integration assertions. Run with BEGIN / ROLLBACK; fixtures
-- and temporary team enablement must NEVER be committed to production.
create temporary table team_qa_context as
select c.workspace_id,c.id as client_id,
  (select id from auth.users where lower(email)='jherholdt@autopac.com.au') as john,
  (select id from auth.users where lower(email)='cbyrne@autopac.com.au') as colleague,
  (select id from auth.users where lower(email)='nsmith@cruisemaster.com.au') as outsider,
  gen_random_uuid() as job,gen_random_uuid() as task,gen_random_uuid() as own_task,
  gen_random_uuid() as flight,gen_random_uuid() as note
from public."website-clients" c where lower(c.name)='autopacific group' and c.archived_at is null;
grant select on team_qa_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',john,'role','authenticated','aal','aal2')::text,true) from team_qa_context;
do $$ declare c record; begin
  select * into c from team_qa_context;
  perform public."website-save-team-member"(c.workspace_id,c.colleague,'QA Reviewer','qa-reviewer','marketing',true);
  insert into public."website-jobs"(id,workspace_id,client_id,status_id,title,assignee_ids)
  select c.job,c.workspace_id,c.client_id,s.id,'QA team brief',array[c.john] from public."website-job-statuses" s where s.workspace_id=c.workspace_id and s.key='planning';
  insert into public."website-job-tasks"(id,workspace_id,job_id,status_id,title,assignee_ids)
  select c.task,c.workspace_id,c.job,s.id,'QA review task',array[c.john] from public."website-task-statuses" s where s.workspace_id=c.workspace_id and s.key='final_draft_notes';
  insert into public."website-flight-events"(id,workspace_id,client_id,title,departure_date,departure_time,arrival_date,arrival_time,origin_location,destination_location,departure_airline,arrival_airline,assignee_ids)
  values(c.flight,c.workspace_id,c.client_id,'QA John flight','2027-02-01','09:00','2027-02-01','11:00','Brisbane','Sydney','Qantas','Qantas',array[c.john]);
  insert into public."website-work-record-notes"(id,workspace_id,record_kind,job_id,body,created_by,updated_by,mention_user_ids)
  values(c.note,c.workspace_id,'job',c.job,'QA comment @qa-reviewer',c.john,c.john,array[c.colleague]);
  if (select assignee_ids from public."website-jobs" where id=c.job)<>array[c.john] then raise exception 'John assignment failed'; end if;
end $$;

do $$ declare c record; campaign uuid:=gen_random_uuid(); week uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); status uuid; delayed uuid; begin
  select * into c from team_qa_context;
  select id into status from public."website-job-statuses" where workspace_id=c.workspace_id and key='planning';
  perform public."website-save-campaign-plan"(c.workspace_id,c.client_id,jsonb_build_object('id',campaign,'title','QA campaign',
    'start_date','2027-02-01','updated_at',null,'assignee_ids',jsonb_build_array(c.john,c.colleague),
    'weeks',jsonb_build_array(jsonb_build_object('id',week,'title','QA week','jobs',jsonb_build_array(jsonb_build_object(
      'id',job,'title','QA campaign job','status_id',status,'shoot_date',null,'due_date','2027-02-05','updated_at',null,
      'assignee_ids',jsonb_build_array(c.john,c.colleague),
      'deliverables',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','QA inherited task','date',null))))))));
  if (select cardinality(assignee_ids) from public."website-campaigns" where id=campaign)<>2 then raise exception 'Campaign multi-assignment failed'; end if;
  if (select cardinality(assignee_ids) from public."website-jobs" where id=job)<>2 then raise exception 'Campaign job multi-assignment failed'; end if;
  perform public."website-create-deliverable-tasks"(job);
  if not exists(select 1 from public."website-job-tasks" where job_id=job and cardinality(assignee_ids)=2 and due_date='2027-02-05') then raise exception 'Deliverable assignment/deadline inheritance failed'; end if;
  select successor_job_id into delayed from public."website-delay-job"(job,'2027-02-08','QA delay history');
  if (select cardinality(assignee_ids) from public."website-jobs" where id=delayed)<>2 then raise exception 'Reschedule lost assignments'; end if;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',colleague,'role','authenticated','aal','aal1')::text,true) from team_qa_context;
do $$ declare c record; changed integer; begin
  select * into c from team_qa_context;
  if (select count(*) from public."website-production-team")<>2 then raise exception 'Active directory scope failed'; end if;
  if not exists(select 1 from public."website-jobs" where id=c.job) then raise exception 'Marketing cannot read the shared brief'; end if;
  if exists(select 1 from public."website-invoices") then raise exception 'Marketing can read CRM invoices'; end if;
  update public."website-job-tasks" set title='UNAUTHORISED' where id=c.task;
  get diagnostics changed=row_count;
  if changed<>0 or (select title from public."website-job-tasks" where id=c.task)<>'QA review task' then raise exception 'Marketing edited a videographer task'; end if;
  begin
    perform public."website-delay-task"(c.task,'2027-02-02','QA denied delay');
    raise exception 'Unexpected permitted delay';
  exception when others then
    if sqlerrm<>'You do not have access to this task.' then raise; end if;
  end;
  perform public."website-approve-production-task"(c.task);
  if not exists(select 1 from public."website-job-tasks" t join public."website-task-statuses" s on s.id=t.status_id where t.id=c.task and s.key='posted_done' and t.approved_by=c.colleague) then raise exception 'Review approval failed'; end if;
  update public."website-jobs" set due_date='2027-02-03' where id=c.job;
  if (select due_date from public."website-job-tasks" where id=c.task) is distinct from '2027-02-03'::date then raise exception 'Marketing brief deadline did not propagate to the inherited task'; end if;
  insert into public."website-job-tasks"(id,workspace_id,job_id,status_id,title)
  select c.own_task,c.workspace_id,c.job,s.id,'QA personal task' from public."website-task-statuses" s where s.workspace_id=c.workspace_id and s.key='not_started';
  if (select assignee_ids from public."website-job-tasks" where id=c.own_task)<>array[c.colleague] then raise exception 'Personal task did not default to current user'; end if;
  update public."website-job-tasks" set title='QA updated personal task' where id=c.own_task;
  get diagnostics changed=row_count; if changed<>1 then raise exception 'Marketing cannot edit its own task'; end if;
  update public."website-flight-events" set title='UNAUTHORISED' where id=c.flight;
  get diagnostics changed=row_count;
  if changed<>0 or (select title from public."website-flight-events" where id=c.flight)<>'QA John flight' then raise exception 'Marketing edited John flight'; end if;
  insert into public."website-flight-plans"(workspace_id,client_id,title,created_by,updated_by)
  values(c.workspace_id,c.client_id,'QA personal itinerary',c.colleague,c.colleague);
  begin perform public."website-team-directory"(c.workspace_id); raise exception 'Unexpected directory access';
  exception when insufficient_privilege then null; end;
  begin perform public."website-save-team-member"(c.workspace_id,c.colleague,'Escalated','qa-reviewer','manager',true); raise exception 'Unexpected role escalation';
  exception when insufficient_privilege then null; end;
  update public."website-work-record-notes" set body='UNAUTHORISED',updated_by=c.colleague where id=c.note;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Marketing edited another author comment'; end if;
  begin
    insert into public."website-note-reads"(note_id,user_id,seen_revision) values(c.note,c.colleague,'2099-01-01');
    raise exception 'Future read revision accepted';
  exception when insufficient_privilege then null; end;
  insert into public."website-note-reads"(note_id,user_id,seen_revision)
  select id,c.colleague,updated_at from public."website-work-record-notes" where id=c.note;
  if not exists(select 1 from public."website-note-reads" where note_id=c.note) then raise exception 'Read acknowledgement failed'; end if;
  update public."website-note-reads" set seen_revision=seen_revision-interval '1 minute' where note_id=c.note;
  if not exists(select 1 from public."website-note-reads" r join public."website-work-record-notes" n on n.id=r.note_id where r.note_id=c.note and r.seen_revision=n.updated_at) then raise exception 'A stale tab regressed the comment read receipt'; end if;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal2')::text,true) from team_qa_context;
do $$ begin
  if exists(select 1 from public."website-production-team") then raise exception 'Unselected account can see team'; end if;
  if exists(select 1 from public."website-jobs") then raise exception 'Unselected account can see jobs'; end if;
  if exists(select 1 from public."website-note-reads") then raise exception 'Unselected account can see read receipts'; end if;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',john,'role','authenticated','aal','aal1')::text,true) from team_qa_context;
do $$ begin
  if exists(select 1 from public."website-jobs") then raise exception 'John MFA password-only access bypassed'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public."website-jobs" j join public."website-clients" c on c.id=j.client_id where lower(c.name)<>'autopacific group' and cardinality(j.assignee_ids)>0) then raise exception 'Unrelated jobs were assigned'; end if;
  if exists(select 1 from public."website-calendar-events" e where e.client_id is null and cardinality(e.assignee_ids)>0) then raise exception 'Personal events were assigned'; end if;
end $$;
select 'PASS: assignments, task review, own work, flights, role escalation, read receipts, unrelated data and MFA' as team_permission_checks;
