-- Store the split used when Lifestyle builds future workout sessions.
alter table public."website-lifestyle-profiles"
  add column if not exists program_style text not null default 'upper_lower';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'website-lifestyle-profiles-program-style-check'
      and conrelid = 'public."website-lifestyle-profiles"'::regclass
  ) then
    alter table public."website-lifestyle-profiles"
      add constraint "website-lifestyle-profiles-program-style-check"
      check (program_style in ('upper_lower', 'full_body'));
  end if;
end
$$;
