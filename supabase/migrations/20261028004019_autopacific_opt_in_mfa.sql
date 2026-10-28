-- Opt-in rollout: the first verified authenticator activates MFA for this portal.
-- All AutoPacific record/file policies and privileged production RPCs converge
-- on this private helper. Other portals and server-side service-role jobs retain
-- their existing behaviour. Own membership reads stay available for MFA setup.
create or replace function "website-private"."website-has-portal-access"(
  requested_workspace_id uuid,
  requested_portal_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public."website-portal-users" portal_user
    where portal_user.workspace_id = requested_workspace_id
      and portal_user.user_id = (select auth.uid())
      and portal_user.portal_key = requested_portal_key
      and portal_user.is_active
  ) and (
    requested_portal_key <> 'autopacific'
    or (select auth.jwt()->>'aal') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors factor
      where factor.user_id = (select auth.uid()) and factor.status = 'verified'
    )
  );
$function$;

-- No public RPC or browser-visible auth schema access is introduced.
revoke all on function "website-private"."website-has-portal-access"(uuid, text) from public, anon;
grant execute on function "website-private"."website-has-portal-access"(uuid, text) to authenticated;
