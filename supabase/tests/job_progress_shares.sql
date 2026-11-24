-- Run against an isolated Postgres test database after the migration.
-- The two known test jobs must be supplied by the fixture (one before and one
-- after the migration) so the same check covers backfill and the insert trigger.
begin;
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.website_job_progress_shares'::regclass)
    or has_table_privilege('anon', 'public.website_job_progress_shares', 'SELECT')
    or has_table_privilege('authenticated', 'public.website_job_progress_shares', 'SELECT')
    or has_function_privilege('anon', 'public.check_job_progress_pin(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.enable_job_progress_share(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.revoke_job_progress_share(uuid)', 'EXECUTE') then
    raise exception 'Share privileges are too broad';
  end if;
end;
$$;

set local role service_role;
do $$
declare first_share public.website_job_progress_shares%rowtype;
declare second_share public.website_job_progress_shares%rowtype;
declare first_job uuid := '11111111-0000-4000-8000-000000000001';
declare second_job uuid := '11111111-0000-4000-8000-000000000002';
declare fresh_pin text;
declare incorrect text;
begin
  select * into strict first_share from public.website_job_progress_shares where job_id = first_job;
  select * into strict second_share from public.website_job_progress_shares where job_id = second_job;
  if first_share.enabled or second_share.enabled or first_share.pin = second_share.pin
    or first_share.pin !~ '^[0-9]{6}$' or second_share.pin !~ '^[0-9]{6}$' then
    raise exception 'Jobs were not assigned unique disabled PINs';
  end if;
  if (select outcome from public.check_job_progress_pin(first_share.token, first_share.pin)) <> 'denied' then
    raise exception 'Inactive shares must deny access';
  end if;
  perform public.enable_job_progress_share(first_job);
  if (select verified_job from public.check_job_progress_pin(first_share.token, first_share.pin)) is distinct from first_job then
    raise exception 'Valid PIN did not unlock its job';
  end if;

  incorrect := second_share.pin;
  for i in 1..5 loop
    if (select outcome from public.check_job_progress_pin(first_share.token, incorrect)) <> 'denied' then
      raise exception 'Another job''s PIN should not unlock this job';
    end if;
  end loop;
  if (select outcome from public.check_job_progress_pin(first_share.token, first_share.pin)) <> 'limited' then
    raise exception 'Repeated failures must lock the link';
  end if;
  update public.website_job_progress_shares set window_until = clock_timestamp() - interval '1 second' where job_id = first_job;
  if (select verified_job from public.check_job_progress_pin(first_share.token, first_share.pin)) is distinct from first_job then
    raise exception 'Link did not recover after the throttle window';
  end if;
  perform public.revoke_job_progress_share(first_job);
  select pin into strict fresh_pin from public.website_job_progress_shares where job_id = first_job;
  if fresh_pin = first_share.pin then raise exception 'Revocation reused the PIN'; end if;
  select token, pin into first_share.token, first_share.pin from public.enable_job_progress_share(first_job);
  update public."website-jobs" set archived_at = clock_timestamp() where id = first_job;
  update public."website-jobs" set archived_at = null where id = first_job;
  if (select outcome from public.check_job_progress_pin(first_share.token, first_share.pin)) <> 'denied' then
    raise exception 'Archival must permanently retire the old link';
  end if;
end;
$$;
rollback;
