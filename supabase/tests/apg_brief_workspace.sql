-- Run inside a transaction and roll back all fixtures.
select set_config('request.jwt.claims','{"sub":"d61eb1c9-8a31-4c49-81fd-93dd478493ce","role":"authenticated"}',true);
set local role authenticated;
do $$
declare workspace uuid := '11111111-1111-4111-8111-111111111111';
 client uuid; planning uuid; todo uuid; review uuid; done uuid; job uuid:=gen_random_uuid(); task uuid:=gen_random_uuid(); missing_dates_job uuid:=gen_random_uuid(); result record; rejected boolean;
begin
 select id into client from public."website-clients" where lower(name)='autopacific group' and archived_at is null;
 select id into planning from public."website-job-statuses" where workspace_id=workspace and key='planning';
 select id into todo from public."website-task-statuses" where workspace_id=workspace and key='not_started';
 select id into review from public."website-task-statuses" where workspace_id=workspace and key='final_draft_notes';
 select id into done from public."website-task-statuses" where workspace_id=workspace and key='posted_done';
 insert into public."website-jobs"(id,workspace_id,client_id,status_id,title,due_date,brief_details,deliverables)
 values(job,workspace,client,planning,'QA brief migration','2026-11-20','{"objective":"Capture the range","sections":[{"key":"shot_list","body":"Product hero and workshop"}]}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Inherited date','date',null),jsonb_build_object('id',gen_random_uuid(),'name','Explicit date','date','2026-11-18')));
 select * into result from public."website-create-deliverable-tasks"(job);
 if result.created_count<>2 then raise exception 'Expected two generated tasks'; end if;
 if not exists(select 1 from public."website-job-tasks" where job_id=job and title='Inherited date' and due_date='2026-11-20') then raise exception 'Parent deadline not inherited'; end if;
 if not exists(select 1 from public."website-job-tasks" where job_id=job and title='Explicit date' and due_date='2026-11-18') then raise exception 'Explicit deadline lost'; end if;
 select * into result from public."website-create-deliverable-tasks"(job);
 if result.created_count<>0 then raise exception 'Duplicate tasks generated'; end if;
 insert into public."website-jobs"(id,workspace_id,client_id,status_id,title,deliverables) values(missing_dates_job,workspace,client,planning,'QA undated brief',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','No deadline','date',null)));
 perform public."website-create-deliverable-tasks"(missing_dates_job);
 if exists(select 1 from public."website-job-tasks" where job_id=missing_dates_job and due_date is not null) then raise exception 'Invented a deadline'; end if;
 insert into public."website-job-tasks"(id,workspace_id,job_id,status_id,title) values(task,workspace,job,todo,'QA approval');
 rejected:=false;begin perform public."website-approve-production-task"(task);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Non-review task could be approved'; end if;
 update public."website-job-tasks" set status_id=review where id=task;
 perform public."website-approve-production-task"(task);
 if not exists(select 1 from public."website-job-tasks" where id=task and status_id=done and completed_at is not null and approved_at is not null and approved_by=auth.uid()) then raise exception 'Approval did not complete/audit the task'; end if;
 perform public."website-approve-production-task"(task);
 rejected:=false;begin update public."website-jobs" set brief_details='{"sections":[{"key":"shot_list","body":"A"},{"key":"shot_list","body":"B"}]}' where id=job;exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Duplicate brief section allowed'; end if;
 insert into public."website-job-attachments"(workspace_id,job_id,storage_path,file_name,mime_type,size_bytes) values(workspace,job,workspace::text||'/'||job::text||'/'||gen_random_uuid()::text||'.pdf','QA private brief.pdf','application/pdf',100);
 rejected:=false;begin insert into public."website-job-attachments"(workspace_id,job_id,storage_path,file_name,mime_type,size_bytes) values(workspace,'99999999-9999-4999-8999-999999999999',workspace::text||'/99999999-9999-4999-8999-999999999999/'||gen_random_uuid()::text||'.pdf','Not authorised.pdf','application/pdf',100);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Out-of-scope attachment was allowed'; end if;
end $$;
reset role;
