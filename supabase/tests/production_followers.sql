-- Real-role integration verification. All notes, preferences and sync queues roll back.
begin;
create temporary table follower_qa as
select c.workspace_id,c.id as client_id,
  (select user_id from public."website-production-team" where workspace_id=c.workspace_id and is_primary_videographer and is_active limit 1) as author,
  (select user_id from public."website-production-team" where workspace_id=c.workspace_id and role='marketing' and is_active limit 1) as subject,
  (select user_id from public."website-production-team" where workspace_id=c.workspace_id and not is_active limit 1) as outsider,
  gen_random_uuid() as assigned_job,gen_random_uuid() as other_job,gen_random_uuid() as followed_job,gen_random_uuid() as mentioned_job,
  gen_random_uuid() as task,gen_random_uuid() as assigned_note,gen_random_uuid() as other_note,gen_random_uuid() as followed_note,
  gen_random_uuid() as mentioned_note,gen_random_uuid() as task_note,gen_random_uuid() as next_note
from public."website-clients" c where lower(c.name)='autopacific group' and c.archived_at is null;
grant select on follower_qa to authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',author,'role','authenticated','aal','aal2')::text,true) from follower_qa;
do $$ declare c record; planning uuid; todo uuid; j uuid; begin
  select * into c from follower_qa;
  assert c.subject is not null,'An existing active Marketing account is required for the role test';
  select id into planning from public."website-job-statuses" where workspace_id=c.workspace_id and key='planning';
  select id into todo from public."website-task-statuses" where workspace_id=c.workspace_id and key='not_started';
  insert into public."website-jobs"(id,workspace_id,client_id,status_id,title,assignee_ids)
    values(c.assigned_job,c.workspace_id,c.client_id,planning,'QA assigned item',array[c.subject]);
  foreach j in array array[c.other_job,c.followed_job,c.mentioned_job] loop
    insert into public."website-jobs"(id,workspace_id,client_id,status_id,title,assignee_ids)
      values(j,c.workspace_id,c.client_id,planning,'QA other item',array[c.author]);
  end loop;
  insert into public."website-job-tasks"(id,workspace_id,job_id,status_id,title,assignee_ids)
    values(c.task,c.workspace_id,c.assigned_job,todo,'QA independently assigned task',array[c.author]);
  insert into public."website-work-record-notes"(id,workspace_id,record_kind,job_id,body,created_by,updated_by)
    values(c.assigned_note,c.workspace_id,'job',c.assigned_job,'QA assigned note',c.author,c.author),
    (c.other_note,c.workspace_id,'job',c.other_job,'QA unrelated note',c.author,c.author),
    (c.followed_note,c.workspace_id,'job',c.followed_job,'QA followed note',c.author,c.author);
  insert into public."website-work-record-notes"(id,workspace_id,record_kind,job_id,body,created_by,updated_by,mention_user_ids)
    values(c.mentioned_note,c.workspace_id,'job',c.mentioned_job,'QA explicit mention',c.author,c.author,array[c.subject]);
  insert into public."website-work-record-notes"(id,workspace_id,record_kind,task_id,body,created_by,updated_by)
    values(c.task_note,c.workspace_id,'task',c.task,'QA task note',c.author,c.author);
  assert (select is_following from public."website-work-record-followers" where record_id=c.mentioned_job and user_id=c.subject),'Mention did not follow the exact job';
  assert (select assignee_ids=array[c.author] from public."website-jobs" where id=c.mentioned_job),'Mention changed assignment';
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated','aal','aal2')::text,true) from follower_qa;
do $$ declare c record; begin
  select * into c from follower_qa;
  assert exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id=c.assigned_note and unread),'Assigned item missing';
  assert exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id=c.mentioned_note),'Direct mention missing';
  assert not exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id in (c.other_note,c.followed_note,c.task_note)),'Unrelated comments leaked into personal feed';
  perform public."website-set-work-record-following"(c.workspace_id,'job',c.followed_job,true);
  assert exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id=c.followed_note),'Followed item missing';
  perform public."website-set-work-record-following"(c.workspace_id,'task',c.task,true);
  assert exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id=c.task_note),'Followed task missing';
  assert not "website-private"."website-can-write-production-task"(c.workspace_id,c.task),'Following granted task edit permission';
  assert not exists(select 1 from public."website-work-record-followers" where user_id<>c.subject),'Can read somebody else''s preferences';
  insert into public."website-note-reads"(note_id,user_id,seen_revision) select id,c.subject,updated_at from public."website-work-record-notes" where id=c.assigned_note;
  assert exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id=c.assigned_note and not unread),'Existing read receipts not respected';
  perform public."website-set-work-record-following"(c.workspace_id,'job',c.followed_job,false);
  assert not exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id=c.followed_note),'Unfollow did not stop ordinary comment updates';
  perform public."website-set-work-record-following"(c.workspace_id,'job',c.mentioned_job,false);
  assert exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id=c.mentioned_note),'Unfollow hid a direct mention';
  begin perform public."website-set-work-record-following"(gen_random_uuid(),'job',c.other_job,true); raise exception 'Cross-workspace follow allowed';
    exception when raise_exception then if sqlerrm='Cross-workspace follow allowed' then raise; end if; end;
  begin perform public."website-set-work-record-following"(c.workspace_id,'job',gen_random_uuid(),true); raise exception 'Nonexistent follow allowed';
    exception when raise_exception then if sqlerrm='Nonexistent follow allowed' then raise; end if; end;
  insert into public."website-work-record-notes"(workspace_id,record_kind,job_id,body,created_by,updated_by)
    values(c.workspace_id,'job',c.assigned_job,'QA own comment',c.subject,c.subject);
  assert not exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where body='QA own comment' and unread),'Notified user of their own comment';
end $$;
reset role;
do $$ declare c record; begin
  select * into c from follower_qa;
  update public."website-work-record-notes" set body=body||' edited',mention_user_ids=mention_user_ids where id=c.mentioned_note;
  assert not (select is_following from public."website-work-record-followers" where record_id=c.mentioned_job and user_id=c.subject),'An unchanged mention silently overrode unfollow';
  insert into public."website-work-record-notes"(id,workspace_id,record_kind,job_id,body,created_by,updated_by,mention_user_ids)
    values(c.next_note,c.workspace_id,'job',c.mentioned_job,'QA fresh direct mention',c.author,c.author,array[c.subject]);
  assert (select is_following from public."website-work-record-followers" where record_id=c.mentioned_job and user_id=c.subject),'A new direct mention did not re-follow';
  assert (select assignee_ids=array[c.author] from public."website-jobs" where id=c.mentioned_job),'Re-follow changed assignment';
  delete from public."website-jobs" where id=c.followed_job;
  assert not exists(select 1 from public."website-work-record-followers" where record_id=c.followed_job),'Deleted record retained dangling followers';
  assert not has_function_privilege('anon','public."website-set-work-record-following"(uuid,text,uuid,boolean)','EXECUTE'),'Anonymous follow RPC access';
  assert not has_function_privilege('authenticated','"website-private"."website-follow-new-note-mentions"()','EXECUTE'),'Privileged trigger callable by clients';
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal2')::text,true) from follower_qa;
do $$ declare c record; begin
  select * into c from follower_qa;
  assert not exists(select 1 from public."website-team-comment-feed"(c.workspace_id) where id in(c.assigned_note,c.mentioned_note,c.next_note)),'Disabled account still received the feed';
  assert not exists(select 1 from public."website-work-record-followers"),'Disabled account retained follow access';
end $$;
reset role;
select 'PASS: assigned/following/mentions, independent tasks, unfollow, new mentions, self-updates, read receipts, RLS, role limits and cleanup' as result;
rollback;
