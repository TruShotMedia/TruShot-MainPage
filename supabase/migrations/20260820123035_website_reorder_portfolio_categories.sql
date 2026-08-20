-- Persist the complete portfolio-category order in one transaction.
-- The function is security invoker, so existing workspace RLS remains authoritative.
create or replace function public."website-reorder-portfolio-categories"(
  p_workspace_id uuid,
  p_category_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_updated_count integer;
begin
  if p_category_ids is null or cardinality(p_category_ids) < 1 then
    raise exception 'Portfolio category order must contain at least one category.' using errcode = '22023';
  end if;

  if (
    select count(distinct ordered.category_id)
    from unnest(p_category_ids) as ordered(category_id)
  ) <> cardinality(p_category_ids) then
    raise exception 'Portfolio category order contains duplicates.' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected_count
  from public."website-portfolio-categories" categories
  where categories.workspace_id = p_workspace_id;

  if v_expected_count <> cardinality(p_category_ids) then
    raise exception 'Portfolio category order must include every category exactly once.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_category_ids) as ordered(category_id)
    where not exists (
      select 1
      from public."website-portfolio-categories" categories
      where categories.id = ordered.category_id
        and categories.workspace_id = p_workspace_id
    )
  ) then
    raise exception 'Portfolio category order contains a category from another workspace.' using errcode = '22023';
  end if;

  update public."website-portfolio-categories" categories
  set position = ordered.ordinality::integer * 10
  from unnest(p_category_ids) with ordinality as ordered(category_id, ordinality)
  where categories.id = ordered.category_id
    and categories.workspace_id = p_workspace_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_expected_count then
    raise exception 'Portfolio category order could not be saved completely.' using errcode = 'P0001';
  end if;

  return v_updated_count;
end;
$$;

revoke all on function public."website-reorder-portfolio-categories"(uuid, uuid[]) from public, anon;
grant execute on function public."website-reorder-portfolio-categories"(uuid, uuid[]) to authenticated;
