-- Move one portfolio item between categories while replacing both complete orders atomically.
-- Security invoker keeps the existing workspace RLS authoritative for every read and update.
create or replace function public."website-move-portfolio-item"(
  p_workspace_id uuid,
  p_item_id uuid,
  p_source_category_id uuid,
  p_target_category_id uuid,
  p_source_item_ids uuid[],
  p_target_item_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_count integer;
  v_target_count integer;
  v_source_updated integer;
  v_target_updated integer;
begin
  if p_source_category_id = p_target_category_id then
    raise exception 'Portfolio destination must be a different category.' using errcode = '22023';
  end if;

  if p_source_item_ids is null or p_target_item_ids is null or cardinality(p_target_item_ids) < 1 then
    raise exception 'Both portfolio orders are required.' using errcode = '22023';
  end if;

  if (
    select count(distinct ordered.item_id)
    from unnest(p_source_item_ids) as ordered(item_id)
  ) <> cardinality(p_source_item_ids)
  or (
    select count(distinct ordered.item_id)
    from unnest(p_target_item_ids) as ordered(item_id)
  ) <> cardinality(p_target_item_ids) then
    raise exception 'Portfolio move contains duplicate items.' using errcode = '22023';
  end if;

  if p_item_id = any(p_source_item_ids) or not (p_item_id = any(p_target_item_ids)) then
    raise exception 'Moved item must appear once in the destination order only.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public."website-portfolio-categories" categories
    where categories.id = p_source_category_id
      and categories.workspace_id = p_workspace_id
  ) or not exists (
    select 1
    from public."website-portfolio-categories" categories
    where categories.id = p_target_category_id
      and categories.workspace_id = p_workspace_id
  ) then
    raise exception 'Portfolio category is not available.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public."website-portfolio-items" items
    where items.id = p_item_id
      and items.workspace_id = p_workspace_id
      and items.category_id = p_source_category_id
  ) then
    raise exception 'Portfolio item is no longer in its source category.' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into v_source_count
  from public."website-portfolio-items" items
  where items.workspace_id = p_workspace_id
    and items.category_id = p_source_category_id;

  select count(*)::integer
  into v_target_count
  from public."website-portfolio-items" items
  where items.workspace_id = p_workspace_id
    and items.category_id = p_target_category_id;

  if cardinality(p_source_item_ids) <> v_source_count - 1
    or cardinality(p_target_item_ids) <> v_target_count + 1 then
    raise exception 'Portfolio move must include both complete category orders.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_source_item_ids) as ordered(item_id)
    where not exists (
      select 1
      from public."website-portfolio-items" items
      where items.id = ordered.item_id
        and items.workspace_id = p_workspace_id
        and items.category_id = p_source_category_id
        and items.id <> p_item_id
    )
  ) or exists (
    select 1
    from unnest(p_target_item_ids) as ordered(item_id)
    where ordered.item_id <> p_item_id
      and not exists (
        select 1
        from public."website-portfolio-items" items
        where items.id = ordered.item_id
          and items.workspace_id = p_workspace_id
          and items.category_id = p_target_category_id
      )
  ) then
    raise exception 'Portfolio move contains media from another category.' using errcode = '22023';
  end if;

  update public."website-portfolio-items" items
  set category_id = p_target_category_id
  where items.id = p_item_id
    and items.workspace_id = p_workspace_id
    and items.category_id = p_source_category_id;

  if cardinality(p_source_item_ids) > 0 then
    update public."website-portfolio-items" items
    set position = ordered.ordinality::integer * 10
    from unnest(p_source_item_ids) with ordinality as ordered(item_id, ordinality)
    where items.id = ordered.item_id
      and items.workspace_id = p_workspace_id
      and items.category_id = p_source_category_id;
    get diagnostics v_source_updated = row_count;
  else
    v_source_updated := 0;
  end if;

  update public."website-portfolio-items" items
  set position = ordered.ordinality::integer * 10
  from unnest(p_target_item_ids) with ordinality as ordered(item_id, ordinality)
  where items.id = ordered.item_id
    and items.workspace_id = p_workspace_id
    and items.category_id = p_target_category_id;
  get diagnostics v_target_updated = row_count;

  if v_source_updated <> cardinality(p_source_item_ids)
    or v_target_updated <> cardinality(p_target_item_ids) then
    raise exception 'Portfolio move could not be saved completely.' using errcode = 'P0001';
  end if;

  return v_source_updated + v_target_updated;
end;
$$;

revoke all on function public."website-move-portfolio-item"(uuid, uuid, uuid, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public."website-move-portfolio-item"(uuid, uuid, uuid, uuid, uuid[], uuid[]) to authenticated;
