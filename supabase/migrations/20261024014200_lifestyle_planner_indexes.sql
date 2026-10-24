-- Cover Lifestyle ownership foreign keys and document service-only reminder access.

create index "website-lifestyle-profiles-workspace-idx"
  on public."website-lifestyle-profiles" (workspace_id);
create index "website-lifestyle-workouts-workspace-idx"
  on public."website-lifestyle-workout-sessions" (workspace_id);
create index "website-lifestyle-exercises-workspace-idx"
  on public."website-lifestyle-session-exercises" (workspace_id);
create index "website-lifestyle-checkins-workspace-idx"
  on public."website-lifestyle-checkins" (workspace_id);
create index "website-lifestyle-push-workspace-idx"
  on public."website-lifestyle-push-subscriptions" (workspace_id);
create index "website-lifestyle-reminders-workspace-idx"
  on public."website-lifestyle-reminder-deliveries" (workspace_id);
create index "website-lifestyle-reminders-user-idx"
  on public."website-lifestyle-reminder-deliveries" (user_id);

create policy "website-lifestyle-reminders-service-only"
on public."website-lifestyle-reminder-deliveries" for all to service_role
using (true)
with check (true);
