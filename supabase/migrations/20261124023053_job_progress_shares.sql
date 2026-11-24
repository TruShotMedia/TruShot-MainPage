-- No credentials on the job record: neither the portal Data API, offline
-- snapshots, job copies nor ClickUp should ever receive them.
create table public.website_job_progress_shares (
  job_id uuid primary key references public."website-jobs"(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  pin text not null unique check (pin ~ '^[0-9]{6}$'),
  enabled boolean not null default false,
  failures integer not null default 0 check (failures between 0 and 5),
  window_until timestamptz
);
alter table public.website_job_progress_shares enable row level security;
revoke all on public.website_job_progress_shares from public, anon, authenticated;
grant select, insert, update on public.website_job_progress_shares to service_role;

create function "website-private".random_job_progress_pin()
returns text language plpgsql volatile set search_path = '' as $$
declare n integer;
begin
  -- Twenty unbiased random bits; reject numbers outside the PIN space.
  loop
    n := ('x' || left(gen_random_uuid()::text, 5))::bit(20)::integer;
    if n < 1000000 then return lpad(n::text, 6, '0'); end if;
  end loop;
end;
$$;
revoke all on function "website-private".random_job_progress_pin() from public, anon, authenticated;
grant execute on function "website-private".random_job_progress_pin() to service_role;

create function "website-private".assign_job_progress_pin(p_job uuid)
returns void language plpgsql set search_path = '' as $$
begin
  for attempt in 1..128 loop
    insert into public.website_job_progress_shares (job_id, pin)
    values (p_job, "website-private".random_job_progress_pin())
    on conflict (pin) do nothing;
    if found then return; end if;
  end loop;
  raise exception 'Could not allocate a job progress PIN';
end;
$$;
revoke all on function "website-private".assign_job_progress_pin(uuid) from public, anon, authenticated;

create function "website-private".on_job_progress_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform "website-private".assign_job_progress_pin(new.id);
  return new;
end;
$$;
revoke all on function "website-private".on_job_progress_insert() from public, anon, authenticated;
create trigger website_job_progress_insert after insert on public."website-jobs"
for each row execute function "website-private".on_job_progress_insert();

-- Backfill without updating or firing sync triggers on existing jobs.
do $$
declare job uuid;
begin
  for job in select id from public."website-jobs" loop
    perform "website-private".assign_job_progress_pin(job);
  end loop;
end;
$$;

create function "website-private".on_job_progress_archive()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.website_job_progress_shares set enabled = false, token = gen_random_uuid()
  where job_id = new.id and enabled;
  return new;
end;
$$;
revoke all on function "website-private".on_job_progress_archive() from public, anon, authenticated;
create trigger website_job_progress_archive after update of archived_at on public."website-jobs"
for each row when (old.archived_at is null and new.archived_at is not null)
execute function "website-private".on_job_progress_archive();

-- Service-only, invoker-rights functions. The app checks the caller's role and
-- job access with their own RLS-bound session before managing a share.
create function public.enable_job_progress_share(p_job uuid)
returns table (token uuid, pin text, enabled boolean)
language plpgsql set search_path = '' as $$
begin
  -- Serialize with archiving, which also retires the old token.
  perform 1 from public."website-jobs" where id = p_job and archived_at is null for share;
  if not found then return; end if;
  return query update public.website_job_progress_shares as s
  set enabled = true where s.job_id = p_job returning s.token, s.pin, s.enabled;
end;
$$;
revoke all on function public.enable_job_progress_share(uuid) from public, anon, authenticated;
grant execute on function public.enable_job_progress_share(uuid) to service_role;

create function public.revoke_job_progress_share(p_job uuid)
returns boolean language plpgsql set search_path = '' as $$
declare fresh_pin text;
begin
  for attempt in 1..128 loop
    fresh_pin := "website-private".random_job_progress_pin();
    begin
      update public.website_job_progress_shares
      set enabled = false, token = gen_random_uuid(), pin = fresh_pin, failures = 0, window_until = null
      where job_id = p_job and pin <> fresh_pin;
      if found then return true; end if;
      if not exists (select 1 from public.website_job_progress_shares where job_id = p_job) then return false; end if;
    exception when unique_violation then
      -- Another job owns the candidate PIN; retry.
    end;
  end loop;
  raise exception 'Could not reset job progress sharing';
end;
$$;
revoke all on function public.revoke_job_progress_share(uuid) from public, anon, authenticated;
grant usage on schema "website-private" to service_role;
grant execute on function public.revoke_job_progress_share(uuid) to service_role;

create function public.check_job_progress_pin(p_token uuid, p_pin text)
returns table (outcome text, verified_job uuid)
language plpgsql set search_path = '' as $$
declare share public.website_job_progress_shares%rowtype;
declare checked_at timestamptz;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return query select 'denied'::text, null::uuid;
    return;
  end if;

  select s.* into share
  from public.website_job_progress_shares s
  join public."website-jobs" j on j.id = s.job_id and j.archived_at is null
  where s.token = p_token and s.enabled
  for update of s;
  if not found then
    return query select 'denied'::text, null::uuid;
    return;
  end if;

  checked_at := clock_timestamp();
  if share.window_until > checked_at and share.failures >= 5 then
    return query select 'limited'::text, null::uuid;
  elsif share.pin = p_pin then
    return query select 'verified'::text, share.job_id;
  else
    update public.website_job_progress_shares
    set failures = case when share.window_until > checked_at then share.failures + 1 else 1 end,
        window_until = case when share.window_until > checked_at then share.window_until else checked_at + interval '15 minutes' end
    where job_id = share.job_id;
    return query select 'denied'::text, null::uuid;
  end if;
end;
$$;
revoke all on function public.check_job_progress_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.check_job_progress_pin(uuid, text) to service_role;
