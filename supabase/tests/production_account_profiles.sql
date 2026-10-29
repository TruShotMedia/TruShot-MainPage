-- Execute within BEGIN / ROLLBACK. No profile data or team enablement is retained.
create temporary table profile_qa as
select '11111111-1111-4111-8111-111111111111'::uuid as workspace,
  (select id from auth.users where lower(email)='jherholdt@autopac.com.au') as john,
  (select id from auth.users where lower(email)='cbyrne@autopac.com.au') as colleague,
  (select id from auth.users where lower(email)='nsmith@cruisemaster.com.au') as outsider;
grant select on profile_qa to authenticated;
-- Isolate the disabled-user case even if this account is enabled in real use.
update public."website-production-team" set is_active=false
where user_id=(select outsider from profile_qa) and workspace_id=(select workspace from profile_qa);

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',john,'role','authenticated','aal','aal2')::text,true) from profile_qa;
do $$ declare c record; begin
  select * into c from profile_qa;
  perform public."website-save-team-member"(c.workspace,c.colleague,'QA Reviewer','qa-profile-reviewer','marketing',true);
  insert into public."website-production-profiles"(workspace_id,user_id,avatar_path)
  values(c.workspace,c.john,c.workspace||'/'||c.john||'/10000000-1111-4111-8111-111111111111.webp')
  on conflict(workspace_id,user_id) do update set avatar_path=excluded.avatar_path;
  if not exists(select 1 from public."website-production-profiles" where user_id=c.john) then raise exception 'Own profile not readable'; end if;
  if not "website-private"."website-profile-photo-access"(c.workspace||'/'||c.john||'/10000000-1111-4111-8111-111111111111.webp',true) then raise exception 'Own photo write denied'; end if;
  if "website-private"."website-profile-photo-access"('../invalid',false) then raise exception 'Invalid object path accepted'; end if;
  if "website-private"."website-profile-photo-access"('22222222-2222-4222-8222-222222222222/'||c.john||'/10000000-1111-4111-8111-111111111111.webp',true) then raise exception 'Cross-workspace object accepted'; end if;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',colleague,'role','authenticated','aal','aal1')::text,true) from profile_qa;
do $$ declare c record; changed integer; begin
  select * into c from profile_qa;
  if not exists(select 1 from public."website-production-profiles" where user_id=c.john) then raise exception 'Enabled teammate cannot read photo'; end if;
  update public."website-production-profiles" set avatar_path=null where user_id=c.john;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Teammate updated another profile'; end if;
  if "website-private"."website-profile-photo-access"(c.workspace||'/'||c.john||'/10000000-1111-4111-8111-111111111111.webp',true) then raise exception 'Teammate can write another photo'; end if;
  if not "website-private"."website-profile-photo-access"(c.workspace||'/'||c.john||'/10000000-1111-4111-8111-111111111111.webp',false) then raise exception 'Teammate photo read denied'; end if;
  begin
    insert into public."website-production-profiles"(workspace_id,user_id) values(c.workspace,c.john);
    raise exception 'Teammate created another profile';
  exception when insufficient_privilege then null; end;
  insert into public."website-production-profiles"(workspace_id,user_id) values(c.workspace,c.colleague) on conflict(workspace_id,user_id) do update set avatar_path=null;
  begin
    update public."website-production-profiles" set user_id=c.outsider where user_id=c.colleague;
    raise exception 'Profile owner could be reassigned';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','aal','aal2')::text,true) from profile_qa;
do $$ declare c record; begin
  select * into c from profile_qa;
  if exists(select 1 from public."website-production-profiles") then raise exception 'Unselected user can read photos'; end if;
  if exists(select 1 from storage.objects where bucket_id='website-team-avatars') then raise exception 'Unselected user can read objects'; end if;
  begin
    insert into public."website-production-profiles"(workspace_id,user_id) values(c.workspace,c.outsider);
    raise exception 'Unselected user created profile';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',john,'role','authenticated','aal','aal1')::text,true) from profile_qa;
do $$ begin
  if exists(select 1 from public."website-production-profiles") then raise exception 'Profile bypassed MFA'; end if;
  if exists(select 1 from storage.objects where bucket_id='website-team-avatars') then raise exception 'Photo object bypassed MFA'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from storage.buckets where id='website-team-avatars' and (public or file_size_limit<>524288 or allowed_mime_types<>array['image/webp'])) then raise exception 'Avatar bucket not private and constrained'; end if;
  if has_table_privilege('anon','public."website-production-profiles"','select') then raise exception 'Anonymous profile access granted'; end if;
  if has_function_privilege('anon','"website-private"."website-profile-access"(uuid,uuid,boolean)','execute') then raise exception 'Anonymous helper access granted'; end if;
end $$;
select 'PASS: own profile, teammate read-only, invalid paths, workspace isolation, unselected users, MFA and private storage' as profile_security_checks;
