-- Apply after the matching application release so legacy TO DO baselines are recognised safely.
update public."website-clickup-integrations" set status_mapping=jsonb_set(jsonb_set(status_mapping,'{planning}','"PLANNING"'),'{scheduled}','"SCHEDULED"');
insert into public."website-clickup-sync-outbox"(workspace_id,job_id,operation)
select j.workspace_id,j.id,'upsert' from public."website-jobs" j join public."website-clickup-integrations" i on i.workspace_id=j.workspace_id and i.target_client_id=j.client_id
 where i.enabled and j.archived_at is null
on conflict(workspace_id,job_id) where status in ('pending','retry') do update set status='pending',attempts=0,available_at=now(),last_error=null;
-- Existing calendar/flight mirrors use Scheduled, not Planning.
insert into public."website-clickup-calendar-event-outbox"(workspace_id,calendar_event_id,operation)
select e.workspace_id,e.id,'upsert' from public."website-calendar-events" e join public."website-clickup-integrations" i on i.workspace_id=e.workspace_id and i.target_client_id=e.client_id where i.enabled
on conflict(workspace_id,calendar_event_id) where status in ('pending','retry') do update set status='pending',attempts=0,available_at=now(),last_error=null;
insert into public."website-clickup-flight-event-outbox"(workspace_id,flight_event_id,operation)
select f.workspace_id,f.id,'upsert' from public."website-flight-events" f join public."website-clickup-integrations" i on i.workspace_id=f.workspace_id and i.target_client_id=f.client_id where i.enabled
on conflict(workspace_id,flight_event_id) where status in ('pending','retry') do update set status='pending',attempts=0,available_at=now(),last_error=null;
