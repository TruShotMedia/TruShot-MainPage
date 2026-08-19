-- Supabase advisor follow-up, scoped exclusively to website-* objects.

drop policy "website-admin-users-own-select" on public."website-admin-users";
drop policy "website-admin-users-owner-manage" on public."website-admin-users";

create policy "website-admin-users-member-select" on public."website-admin-users"
for select to authenticated
using (
  (user_id = (select auth.uid()) and is_active)
  or (select "website-private"."website-has-finance-access"(workspace_id))
);

create policy "website-admin-users-owner-insert" on public."website-admin-users"
for insert to authenticated
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-admin-users-owner-update" on public."website-admin-users"
for update to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

create policy "website-admin-users-owner-delete" on public."website-admin-users"
for delete to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)));

create index "website-client-contacts-workspace-idx" on public."website-client-contacts" (workspace_id);
create index "website-clients-created-by-idx" on public."website-clients" (created_by) where created_by is not null;
create index "website-clients-updated-by-idx" on public."website-clients" (updated_by) where updated_by is not null;
create index "website-enquiries-reviewer-idx" on public."website-enquiries" (reviewed_by) where reviewed_by is not null;
create index "website-import-runs-creator-idx" on public."website-import-runs" (created_by) where created_by is not null;
create index "website-invoice-allocations-overrider-idx" on public."website-invoice-job-allocations" (overridden_by) where overridden_by is not null;
create index "website-invoice-lines-workspace-idx" on public."website-invoice-lines" (workspace_id);
create index "website-job-tasks-created-by-idx" on public."website-job-tasks" (created_by) where created_by is not null;
create index "website-job-tasks-updated-by-idx" on public."website-job-tasks" (updated_by) where updated_by is not null;
create index "website-job-tasks-workspace-idx" on public."website-job-tasks" (workspace_id);
create index "website-jobs-created-by-idx" on public."website-jobs" (created_by) where created_by is not null;
create index "website-jobs-updated-by-idx" on public."website-jobs" (updated_by) where updated_by is not null;
create index "website-package-templates-workspace-idx" on public."website-package-task-templates" (workspace_id);
create index "website-payments-workspace-idx" on public."website-payments" (workspace_id);
create index "website-pricing-items-workspace-idx" on public."website-pricing-package-items" (workspace_id);
create index "website-pricing-packages-workspace-idx" on public."website-pricing-packages" (workspace_id);
create index "website-pricing-versions-publisher-idx" on public."website-pricing-versions" (published_by) where published_by is not null;
create index "website-task-comments-author-idx" on public."website-task-comments" (author_id) where author_id is not null;
create index "website-task-comments-workspace-idx" on public."website-task-comments" (workspace_id);
create index "website-tax-snapshots-creator-idx" on public."website-tax-estimate-snapshots" (created_by) where created_by is not null;
create index "website-tax-snapshots-workspace-idx" on public."website-tax-estimate-snapshots" (workspace_id);
create index "website-activity-log-actor-idx" on public."website-activity-log" (actor_id) where actor_id is not null;
create index "website-audit-log-actor-idx" on public."website-audit-log" (actor_id) where actor_id is not null;
