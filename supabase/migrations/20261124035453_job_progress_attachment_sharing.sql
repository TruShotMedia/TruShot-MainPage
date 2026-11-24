-- Existing and newly uploaded files are workspace-only until explicitly shared.
alter table public."website-job-attachments"
  add column shared_on_progress boolean not null default false;

-- Users can still attach and remove files under existing RLS. Only the
-- authorised server action can mark a file for client access. Uploaded object
-- identity is immutable to portal callers, even after it has been shared.
revoke all on public."website-job-attachments" from public, anon, authenticated;
grant select, insert (workspace_id, job_id, storage_path, file_name, mime_type, size_bytes),
      update (archived_at)
  on public."website-job-attachments" to authenticated;

create policy "no-restoring-archived-job-attachments"
  on public."website-job-attachments" as restrictive for update to authenticated
  using (archived_at is null) with check (true);
