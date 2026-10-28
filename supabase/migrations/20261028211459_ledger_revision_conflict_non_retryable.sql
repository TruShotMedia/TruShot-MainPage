-- Prevent application-level Ledger conflicts from triggering PostgREST's
-- automatic retry of SQLSTATE 40001. Preserve the existing conflict message,
-- function signature, successful-save logic, owner and grants.
-- Shared-project database hotfix; no website deployment is required.
-- https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions
set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $migration$
declare
  target regprocedure := to_regprocedure('public.ledger_save_snapshot_v2(jsonb,bigint)');
  original_definition text;
  old_guard constant text := $old$errcode = '40001', message = 'LEDGER_REVISION_CONFLICT'$old$;
  new_guard constant text := $new$errcode = 'PT409', message = 'LEDGER_REVISION_CONFLICT'$new$;
  expected_definition_md5 constant text := '16a470b389baf8a244d739fd6c2f3dce';
  metadata_before jsonb;
  metadata_after jsonb;
begin
  if target is null then
    raise exception 'Expected Ledger snapshot function was not found; no changes applied.';
  end if;

  select pg_get_functiondef(target),
    jsonb_build_object('owner',proowner,'acl',proacl,'security_definer',prosecdef,'config',proconfig)
    into original_definition,metadata_before from pg_proc where oid=target;

  -- Permit an exact replay, but fail safely if another release changed the function.
  if md5(replace(original_definition,new_guard,old_guard))=expected_definition_md5
     and strpos(original_definition,old_guard)=0 then
    return;
  end if;
  if md5(original_definition)<>expected_definition_md5
     or (length(original_definition)-length(replace(original_definition,old_guard,'')))/length(old_guard)<>2 then
    raise exception 'Ledger function differs from the reviewed definition; no changes applied.';
  end if;

  execute replace(original_definition,old_guard,new_guard);

  select jsonb_build_object('owner',proowner,'acl',proacl,'security_definer',prosecdef,'config',proconfig)
    into metadata_after from pg_proc where oid=target;
  if metadata_after is distinct from metadata_before then
    raise exception 'Ledger permissions changed unexpectedly; rolling back.';
  end if;
end;
$migration$;
