-- Run against the rollout state before the real authenticator is enrolled.
-- The test factor is transaction-local: no Auth API calls, real seed, session
-- changes or persistent enrollment. ROLLBACK is mandatory.
begin;
set local statement_timeout = '10s';
do $test$
declare
  v_user uuid;
  v_workspace uuid;
  v_job uuid;
  v_factor uuid := gen_random_uuid();
begin
  select portal.user_id, portal.workspace_id into strict v_user, v_workspace
    from public."website-portal-users" portal
    join auth.users account on account.id = portal.user_id
    where lower(account.email) = 'jherholdt@autopac.com.au'
      and portal.portal_key = 'autopacific' and portal.is_active;
  assert not exists(select 1 from auth.mfa_factors where user_id = v_user and status = 'verified'), 'Run only before real enrollment';
  select job.id into strict v_job from public."website-jobs" job
    join public."website-clients" client on client.id = job.client_id
    where job.workspace_id = v_workspace and lower(client.name) = 'autopacific group'
    limit 1;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  assert "website-private"."website-has-portal-access"(v_workspace, 'autopacific'), 'Unenrolled account should not be locked out';
  assert exists(select 1 from public."website-jobs" where id = v_job), 'Rollout must retain existing access';
  reset role;

  insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    values(v_factor, v_user, 'Transaction-only MFA policy test', 'totp', 'verified', now(), now());
  set local role authenticated;
  assert not "website-private"."website-has-portal-access"(v_workspace, 'autopacific'), 'AAL1 must fail after enrollment';
  assert not exists(select 1 from public."website-jobs"), 'Jobs must not leak at AAL1';
  assert not exists(select 1 from public."website-job-tasks"), 'Tasks must not leak at AAL1';
  assert not exists(select 1 from public."website-flight-events"), 'Flights must not leak at AAL1';
  assert not "website-private"."website-can-access-production-job"(v_workspace, v_job), 'Privileged production RPC/file authorization must fail at AAL1';
  assert exists(select 1 from public."website-portal-users" where user_id = v_user), 'Membership must remain readable to complete MFA';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  assert "website-private"."website-has-portal-access"(v_workspace, 'autopacific'), 'Verified session must be accepted';
  assert exists(select 1 from public."website-jobs" where id = v_job), 'AAL2 must restore own jobs';
  assert "website-private"."website-can-access-production-job"(v_workspace, v_job), 'AAL2 must restore production authorization';
  assert not exists(select 1 from public."website-invoices"), 'MFA must not grant full CRM access';
  reset role;
end;
$test$;
rollback;
select 'passed: safe rollout, AAL1 rejection, AAL2 access and unchanged client scope; test factor rolled back' as mfa_verification;
