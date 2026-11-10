-- Rollback-only access/lease verification. No tasks are sent to ClickUp.
begin;
do $$ begin
  if has_table_privilege('anon','public."website-clickup-outlook-bridge"','select')
    or has_table_privilege('authenticated','public."website-clickup-outlook-bridge"','select')
    or has_table_privilege('authenticated','public."website-clickup-outlook-links"','select')
    or has_table_privilege('anon','public."website-clickup-outlook-links"','insert')
    or has_function_privilege('authenticated','public."website-clickup-outlook-lease"(uuid,uuid,text)','execute')
    or has_function_privilege('anon','public."website-clickup-outlook-lease"(uuid,uuid,text)','execute')
  then raise exception 'Bridge exposed to browser roles'; end if;
  if exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('website-clickup-outlook-bridge','website-clickup-outlook-links') and not c.relrowsecurity)
  then raise exception 'Bridge RLS missing'; end if;
end $$;
set local role service_role;
insert into public."website-clickup-outlook-bridge"(workspace_id,user_id,list_id,enabled)
select '11111111-1111-4111-8111-111111111111',user_id,'1300350000012117',false
from public."website-production-team" where workspace_id='11111111-1111-4111-8111-111111111111' and is_primary_videographer and is_active;
do $$ declare w uuid:='11111111-1111-4111-8111-111111111111'; t uuid:=gen_random_uuid(); begin
  if public."website-clickup-outlook-lease"(w,t,'claim') then raise exception 'Disabled bridge lease allowed'; end if;
  update public."website-clickup-outlook-bridge" set enabled=true where workspace_id=w;
  if not public."website-clickup-outlook-lease"(w,t,'claim') then raise exception 'Service lease denied'; end if;
  if public."website-clickup-outlook-lease"(w,gen_random_uuid(),'claim') then raise exception 'Concurrent bridge worker allowed'; end if;
  if public."website-clickup-outlook-lease"(w,gen_random_uuid(),'renew') then raise exception 'Wrong lease token accepted'; end if;
  if not public."website-clickup-outlook-lease"(w,t,'renew') then raise exception 'Renew denied'; end if;
  if not public."website-clickup-outlook-lease"(w,t,'release') then raise exception 'Release denied'; end if;
  update public."website-clickup-outlook-bridge" set next_sync_at=now()+interval '1 hour' where workspace_id=w;
  if public."website-clickup-outlook-lease"(w,t,'claim') then raise exception 'Cooldown bypassed'; end if;
end $$;
reset role;
select 'Outlook bridge grants, RLS, service-role writes, serialization and cooldown verified; changes rolled back' as result;
rollback;
