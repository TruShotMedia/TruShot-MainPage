-- Run only as a single transaction. Every test save is rolled back.
-- No account, financial record or snapshot is retained or modified by this test.
begin;
set local statement_timeout = '10s';
set local lock_timeout = '2s';

do $test$
declare
  target regprocedure := 'public.ledger_save_snapshot_v2(jsonb,bigint)'::regprocedure;
  original_snapshot record;
  saved_result jsonb;
  definition text := pg_get_functiondef(target);
  old_guard constant text := $old$errcode = '40001', message = 'LEDGER_REVISION_CONFLICT'$old$;
  new_guard constant text := $new$errcode = 'PT409', message = 'LEDGER_REVISION_CONFLICT'$new$;
begin
  if md5(replace(definition,new_guard,old_guard))<>'16a470b389baf8a244d739fd6c2f3dce'
     or strpos(definition,old_guard)>0 then
    raise exception 'Function changed beyond the reviewed error-code replacement.';
  end if;
  if has_function_privilege('anon',target,'EXECUTE')
     or not has_function_privilege('authenticated',target,'EXECUTE') then
    raise exception 'Ledger execution grants changed.';
  end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.ledger_save_snapshot_v2('{}'::jsonb,0);
    raise exception 'Unauthenticated save unexpectedly succeeded.';
  exception when sqlstate '42501' then
    if sqlerrm<>'LEDGER_AUTH_REQUIRED' then raise; end if;
  end;

  select user_id,data,revision,updated_at into strict original_snapshot
  from public.ledger_app_data order by user_id limit 1;
  perform set_config('request.jwt.claim.sub',original_snapshot.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',original_snapshot.user_id,'role','authenticated')::text,true);

  begin
    perform public.ledger_save_snapshot_v2(null,original_snapshot.revision);
    raise exception 'Invalid snapshot unexpectedly accepted.';
  exception when sqlstate '22023' then
    if sqlerrm<>'LEDGER_INVALID_SNAPSHOT' then raise; end if;
  end;

  begin
    perform public.ledger_save_snapshot_v2(original_snapshot.data,original_snapshot.revision+1);
    raise exception 'Stale revision unexpectedly accepted.';
  exception when sqlstate 'PT409' then
    if sqlerrm<>'LEDGER_REVISION_CONFLICT' then raise; end if;
  end;
  if not exists(select 1 from public.ledger_app_data where user_id=original_snapshot.user_id
    and data=original_snapshot.data and revision=original_snapshot.revision
    and updated_at=original_snapshot.updated_at) then
    raise exception 'Conflict changed the saved snapshot.';
  end if;

  -- Exercise a valid save with the same payload in a subtransaction, then undo
  -- it and all normalized-table writes before returning from the test.
  begin
    saved_result:=public.ledger_save_snapshot_v2(original_snapshot.data,original_snapshot.revision);
    if (saved_result->>'revision')::bigint<>original_snapshot.revision+1 then
      raise exception 'Valid save did not increment its revision.';
    end if;
    if not exists(select 1 from public.ledger_app_data where user_id=original_snapshot.user_id
      and data=original_snapshot.data and revision=original_snapshot.revision+1) then
      raise exception 'Valid save did not preserve the payload.';
    end if;
    raise sqlstate 'ZX001' using message='ROLLBACK_VERIFIED_LEDGER_TEST_SAVE';
  exception when sqlstate 'ZX001' then
    if sqlerrm<>'ROLLBACK_VERIFIED_LEDGER_TEST_SAVE' then raise; end if;
  end;
  if not exists(select 1 from public.ledger_app_data where user_id=original_snapshot.user_id
    and data=original_snapshot.data and revision=original_snapshot.revision
    and updated_at=original_snapshot.updated_at) then
    raise exception 'Test save was not rolled back.';
  end if;
end;
$test$;
select 'PASS: only conflict SQLSTATE changed; auth, grants, stale-save protection and valid saves verified; all test writes rolled back' as verification;
rollback;
