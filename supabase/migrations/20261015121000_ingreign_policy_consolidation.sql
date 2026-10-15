-- Keep INGREIGN access checks in one permissive policy per action so Postgres
-- does not evaluate overlapping portal and admin SELECT policies.

drop policy if exists "website-portal-users-own-select"
on public."website-portal-users";

drop policy if exists "website-portal-users-admin-all"
on public."website-portal-users";

create policy "website-portal-users-select"
on public."website-portal-users"
for select to authenticated
using (
  (user_id = (select auth.uid()) and is_active)
  or (select "website-private"."website-has-workspace-access"(workspace_id))
);

create policy "website-portal-users-admin-insert"
on public."website-portal-users"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-portal-users-admin-update"
on public."website-portal-users"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-portal-users-admin-delete"
on public."website-portal-users"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

drop policy if exists "website-ingreign-caption-presets-portal-select"
on public."website-ingreign-caption-presets";

drop policy if exists "website-ingreign-caption-presets-admin-all"
on public."website-ingreign-caption-presets";

create policy "website-ingreign-caption-presets-select"
on public."website-ingreign-caption-presets"
for select to authenticated
using (
  (select "website-private"."website-has-portal-access"(workspace_id, 'ingreign'))
  or (select "website-private"."website-has-workspace-access"(workspace_id))
);

create policy "website-ingreign-caption-presets-admin-insert"
on public."website-ingreign-caption-presets"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-ingreign-caption-presets-admin-update"
on public."website-ingreign-caption-presets"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-ingreign-caption-presets-admin-delete"
on public."website-ingreign-caption-presets"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));

drop policy if exists "website-ingreign-manual-events-portal-select"
on public."website-ingreign-manual-events";

drop policy if exists "website-ingreign-manual-events-admin-all"
on public."website-ingreign-manual-events";

create policy "website-ingreign-manual-events-select"
on public."website-ingreign-manual-events"
for select to authenticated
using (
  (select "website-private"."website-has-portal-access"(workspace_id, 'ingreign'))
  or (select "website-private"."website-has-workspace-access"(workspace_id))
);

create policy "website-ingreign-manual-events-admin-insert"
on public."website-ingreign-manual-events"
for insert to authenticated
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-ingreign-manual-events-admin-update"
on public."website-ingreign-manual-events"
for update to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)))
with check ((select "website-private"."website-has-workspace-access"(workspace_id)));

create policy "website-ingreign-manual-events-admin-delete"
on public."website-ingreign-manual-events"
for delete to authenticated
using ((select "website-private"."website-has-workspace-access"(workspace_id)));
