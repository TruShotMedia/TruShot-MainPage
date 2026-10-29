-- Personal presentation is separate from team membership and permissions.
create table public."website-production-profiles" (
  workspace_id uuid not null references public."website-workspaces"(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_path text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id),
  constraint production_avatar_owner_path check (avatar_path is null or
    avatar_path ~ ('^' || workspace_id::text || '/' || user_id::text || '/[0-9a-f-]{36}\.webp$'))
);
create index production_profiles_user_idx on public."website-production-profiles"(user_id);
alter table public."website-production-profiles" enable row level security;
revoke all on public."website-production-profiles" from anon;
grant select,insert,update,delete on public."website-production-profiles" to authenticated;

-- Only this internal lookup bypasses team-directory RLS. It checks the caller,
-- workspace access and MFA before considering the target member.
create function "website-private"."website-profile-access"(p_workspace uuid,p_user uuid,p_write boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null
    and ((select "website-private"."website-has-workspace-access"(p_workspace))
      or (select "website-private"."website-team-role"(p_workspace)) is not null)
    and (p_user=(select auth.uid()) or (not p_write and exists (
      select 1 from public."website-production-team" t
      where t.workspace_id=p_workspace and t.user_id=p_user and t.is_active
    )));
$$;
revoke all on function "website-private"."website-profile-access"(uuid,uuid,boolean) from public,anon;
grant execute on function "website-private"."website-profile-access"(uuid,uuid,boolean) to authenticated;
create policy "production-profile-read" on public."website-production-profiles" for select to authenticated
  using ((select "website-private"."website-profile-access"(workspace_id,user_id,false)));
create policy "production-profile-insert-own" on public."website-production-profiles" for insert to authenticated
  with check ((select "website-private"."website-profile-access"(workspace_id,user_id,true)));
create policy "production-profile-update-own" on public."website-production-profiles" for update to authenticated
  using ((select "website-private"."website-profile-access"(workspace_id,user_id,true)))
  with check ((select "website-private"."website-profile-access"(workspace_id,user_id,true)));
create policy "production-profile-delete-own" on public."website-production-profiles" for delete to authenticated
  using ((select "website-private"."website-profile-access"(workspace_id,user_id,true)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('website-team-avatars','website-team-avatars',false,524288,array['image/webp']);

create function "website-private"."website-profile-photo-access"(p_name text,p_write boolean)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' then
    return false;
  end if;
  return "website-private"."website-profile-access"(split_part(p_name,'/',1)::uuid,split_part(p_name,'/',2)::uuid,p_write);
end;
$$;
revoke all on function "website-private"."website-profile-photo-access"(text,boolean) from public,anon;
grant execute on function "website-private"."website-profile-photo-access"(text,boolean) to authenticated;
create policy "production-avatar-read" on storage.objects for select to authenticated
  using (bucket_id='website-team-avatars' and (select "website-private"."website-profile-photo-access"(name,false)));
create policy "production-avatar-upload-own" on storage.objects for insert to authenticated
  with check (bucket_id='website-team-avatars' and (select "website-private"."website-profile-photo-access"(name,true)));
create policy "production-avatar-delete-own" on storage.objects for delete to authenticated
  using (bucket_id='website-team-avatars' and (select "website-private"."website-profile-photo-access"(name,true)));
