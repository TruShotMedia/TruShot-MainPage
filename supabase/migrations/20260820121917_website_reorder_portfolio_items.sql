-- Persist a complete portfolio-category order in one transaction.
-- The function is security invoker, so the existing workspace RLS remains authoritative.
create or replace function public."website-reorder-portfolio-items"(
  p_workspace_id uuid,
  p_category_id uuid,
  p_item_ids uuid[]
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
  if p_item_ids is null or cardinality(p_item_ids) < 1 then
    raise exception 'Portfolio order must contain at least one item.' using errcode = '22023';
  end if;

  if (
    select count(distinct ordered.item_id)
    from unnest(p_item_ids) as ordered(item_id)
  ) <> cardinality(p_item_ids) then
    raise exception 'Portfolio order contains duplicate items.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public."website-portfolio-categories" categories
    where categories.id = p_category_id
      and categories.workspace_id = p_workspace_id
  ) then
    raise exception 'Portfolio category is not available.' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into v_expected_count
  from public."website-portfolio-items" items
  where items.workspace_id = p_workspace_id
    and items.category_id = p_category_id;

  if v_expected_count <> cardinality(p_item_ids) then
    raise exception 'Portfolio order must include every item in the category exactly once.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_item_ids) as ordered(item_id)
    where not exists (
      select 1
      from public."website-portfolio-items" items
      where items.id = ordered.item_id
        and items.workspace_id = p_workspace_id
        and items.category_id = p_category_id
    )
  ) then
    raise exception 'Portfolio order contains an item from another category.' using errcode = '22023';
  end if;

  update public."website-portfolio-items" items
  set position = ordered.ordinality::integer * 10
  from unnest(p_item_ids) with ordinality as ordered(item_id, ordinality)
  where items.id = ordered.item_id
    and items.workspace_id = p_workspace_id
    and items.category_id = p_category_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_expected_count then
    raise exception 'Portfolio order could not be saved completely.' using errcode = 'P0001';
  end if;

  return v_updated_count;
end;
$$;

revoke all on function public."website-reorder-portfolio-items"(uuid, uuid, uuid[]) from public, anon;
grant execute on function public."website-reorder-portfolio-items"(uuid, uuid, uuid[]) to authenticated;
