-- Version matches the migration applied by Supabase.
alter table public."website-jobs" add column brief_details jsonb not null default '{}', add column shoot_end_time time;
alter table public."website-job-tasks" add column approved_at timestamptz, add column approved_by uuid;

create function "website-private"."website-valid-job-brief"(brief jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare section jsonb; seen text[] := '{}'; field text;
begin
  if jsonb_typeof(brief)<>'object' or octet_length(brief::text)>40000 then return false; end if;
  for field in select jsonb_object_keys(brief) loop
    if field not in ('objective','audience','contact_name','contact_email','contact_phone','sections') then return false; end if;
    if field<>'sections' and (jsonb_typeof(brief->field)<>'string' or char_length(brief->>field)>2000) then return false; end if;
  end loop;
  if brief ? 'sections' then
    if jsonb_typeof(brief->'sections')<>'array' or jsonb_array_length(brief->'sections')>4 then return false; end if;
    for section in select value from jsonb_array_elements(brief->'sections') loop
      if jsonb_typeof(section)<>'object' or section->>'key' is null or section->>'key' not in ('output_specs','shot_list','creative_direction','approvals')
        or jsonb_typeof(section->'body') is distinct from 'string' or char_length(section->>'body')>4000 or section->>'key'=any(seen) then return false; end if;
      seen:=array_append(seen,section->>'key');
    end loop;
  end if;
  return true;
end $$;
revoke all on function "website-private"."website-valid-job-brief"(jsonb) from public, anon;
grant execute on function "website-private"."website-valid-job-brief"(jsonb) to authenticated,service_role;
alter table public."website-jobs" add constraint "website-job-brief-check" check ("website-private"."website-valid-job-brief"(brief_details));
alter table public."website-jobs" add constraint "website-job-shoot-end-check" check (shoot_end_time is null or shoot_time is null or shoot_end_time>shoot_time);

create table public."website-job-attachments" (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public."website-workspaces"(id),
 job_id uuid not null references public."website-jobs"(id) on delete cascade,
 storage_path text not null unique, file_name text not null check(char_length(file_name) between 1 and 240),
 mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 52428800),
 created_at timestamptz not null default now(), archived_at timestamptz,
 check(storage_path like workspace_id::text||'/'||job_id::text||'/%')
);
create index "website-job-attachments-job-idx" on public."website-job-attachments"(workspace_id,job_id,created_at);
create index "website-job-attachments-job-fk-idx" on public."website-job-attachments"(job_id);
alter table public."website-job-attachments" enable row level security;
grant select,insert,update on public."website-job-attachments" to authenticated;
grant all on public."website-job-attachments" to service_role;
create policy "production-job-attachments" on public."website-job-attachments" for all to authenticated
 using ((select "website-private"."website-can-access-production-job"(workspace_id,job_id)))
 with check ((select "website-private"."website-can-access-production-job"(workspace_id,job_id)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('website-job-attachments','website-job-attachments',false,52428800,array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','video/mp4','video/quicktime','video/webm','text/plain','text/csv','application/zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation']);
create function "website-private"."website-can-access-job-file"(path text)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,10}$' then return false; end if;
 return "website-private"."website-can-access-production-job"(split_part(path,'/',1)::uuid,split_part(path,'/',2)::uuid);
exception when invalid_text_representation then return false;
end $$;
revoke all on function "website-private"."website-can-access-job-file"(text) from public,anon;
grant execute on function "website-private"."website-can-access-job-file"(text) to authenticated;
create policy "production-job-files-read" on storage.objects for select to authenticated
 using(bucket_id='website-job-attachments' and (select "website-private"."website-can-access-job-file"(name)));
create policy "production-job-files-upload" on storage.objects for insert to authenticated
 with check(bucket_id='website-job-attachments' and (select "website-private"."website-can-access-job-file"(name)));

create function public."website-approve-production-task"(p_task_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare task record; done uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sign in to approve work.'; end if;
 select t.*,s.key as stage into task from public."website-job-tasks" t join public."website-task-statuses" s on s.id=t.status_id
  where t.id=p_task_id and t.archived_at is null for update of t;
 if not found then raise exception 'This task is unavailable.'; end if;
 if task.stage='posted_done' then return; end if;
 if task.stage not in ('ready_for_revision','final_draft_notes','ready_to_post') then raise exception 'This task is no longer awaiting review. Refresh and check its current status.'; end if;
 select id into done from public."website-task-statuses" where workspace_id=task.workspace_id and key='posted_done' and is_active;
 if done is null then raise exception 'Completion status is unavailable.'; end if;
 update public."website-job-tasks" set status_id=done, completed_at=now(),approved_at=now(),approved_by=auth.uid(),updated_by=auth.uid() where id=p_task_id;
end $$;
revoke all on function public."website-approve-production-task"(uuid) from public,anon;
grant execute on function public."website-approve-production-task"(uuid) to authenticated;

-- Preserve new brief fields across the existing immutable reschedule chain.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public."website-delay-job"(uuid,date,text)'::regprocedure);
 if position('key_deliverables, deliverables, created_by' in definition)=0 then raise exception 'Unexpected delay function'; end if;
 definition:=replace(definition,'key_deliverables, deliverables, created_by','key_deliverables, deliverables, brief_details, shoot_end_time, created_by');
 definition:=replace(definition,'v_source.key_deliverables, v_source.deliverables, auth.uid()','v_source.key_deliverables, v_source.deliverables, v_source.brief_details, v_source.shoot_end_time, auth.uid()');
 execute definition;
 definition:=pg_get_functiondef('"website-private"."website-queue-clickup-job-sync"()'::regprocedure);
 definition:=replace(definition,'new.title, new.job_number','new.brief_details, new.deliverables, new.shoot_end_time, new.title, new.job_number');
 definition:=replace(definition,'old.title, old.job_number','old.brief_details, old.deliverables, old.shoot_end_time, old.title, old.job_number');
 execute definition;
end $$;

-- Keep earlier brief content recoverable without loading revision payloads on the board.
alter table public."website-jobs" add column brief_history jsonb not null default '[]';
create function "website-private"."website-retain-job-brief"()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if row(new.brief_details,new.description,new.deliverables) is distinct from row(old.brief_details,old.description,old.deliverables) then
   new.brief_history := (select coalesce(jsonb_agg(item order by position),'[]') from (
     select value as item,ordinality as position from jsonb_array_elements(jsonb_build_array(jsonb_build_object('saved_at',now(),'brief_details',old.brief_details,'description',old.description,'deliverables',old.deliverables))||old.brief_history) with ordinality limit 20
   ) versions);
 end if;
 return new;
end $$;
revoke all on function "website-private"."website-retain-job-brief"() from public,anon,authenticated,service_role;
create trigger "website-jobs-retain-brief" before update of brief_details,description,deliverables on public."website-jobs" for each row execute function "website-private"."website-retain-job-brief"();
