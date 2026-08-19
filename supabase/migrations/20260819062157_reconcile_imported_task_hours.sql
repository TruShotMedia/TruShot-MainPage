-- Reconcile task hours from the 19 August 2026 Notion Tasks export.
-- Only rows with an explicit numeric Hours property are included. The update is
-- deliberately guarded so a renamed, duplicated, archived, or already-edited
-- task causes the migration to fail instead of applying data ambiguously.

do $$
declare
  updated_count integer;
begin
  with exported_hours(title, hours) as (
    values
      ('30 Sec Overview Reel of store', 1::numeric),
      ('BBL x Edge Pro x Mayfair Vlog 03-JUNE-2026', 5::numeric),
      ('Bed series 1  - 20 sec', 0.5::numeric),
      ('Bed series 2 - 20sec', 0.5::numeric),
      ('BTS OMF Short', 1::numeric),
      ('CSS Touring BTS', 2::numeric),
      ('Dispatch EdgePro', 0.5::numeric),
      ('Edge Pro Make backgrounds white', 1::numeric),
      ('FloGlass Cine Clips', 2::numeric),
      ('GCElite 160 Burleigh Street - Update Reel', 3::numeric),
      ('LEND-IT, Dayle, HUGEE Red Flag', 5::numeric),
      ('LEND-IT, Dayle, Thank you Video', 0::numeric),
      ('LEND-IT, Nick Short Cuts (Questions)', 0.5::numeric),
      ('LEND-IT, Nick’s Intro Video (1m:36)', 0.5::numeric),
      ('LEND-IT, Not all brokers are the same, Dayle BTS', 0::numeric),
      ('LEND-IT, Postcards, 30-JUN-2026', 0.25::numeric),
      ('Mayfair, IG, Photo Set', 0.5::numeric),
      ('Mayfair, YT, Intro Video (Luke''s GAIJIN Build Intro)', 5::numeric),
      ('Mayfair, YT, Shorts', 1.5::numeric),
      ('OMF - Bed Frame - Wood Video Horizontal', 0.25::numeric),
      ('OMF - Bed Frame - Wood Video Vertical', 0.25::numeric),
      ('OMF - Bed Frames and Furniture (Photo)', 0::numeric),
      ('OMF - RECAP-JULY-1', 0.33::numeric),
      ('OMF - RECAP-JULY-2', 0.33::numeric),
      ('OMF - Renew Bed 1 Video Horizontal', 0.25::numeric),
      ('OMF - Renew Bed 1 Video Vertical', 0.25::numeric),
      ('OMF - Renew Bed 2 Video Horizontal', 0.25::numeric),
      ('OMF - Renew Bed 2 Video Vertical', 0.25::numeric),
      ('OMF - Renew Beds and frames Hours Shooting Time', 2.75::numeric),
      ('OMF - Renew Beds Photos', 1.5::numeric),
      ('OMF B, B+, P1 Photos', 0.5::numeric),
      ('OMF Bed Series Photos', 0.5::numeric),
      ('OMF Bedding (Mt G & Slacks) Screensnaps', 0.25::numeric),
      ('OMF Bedding Edit - Basics (P/V)', 0.5::numeric),
      ('OMF Bedding Edit - Basics+ (P/V)', 0.5::numeric),
      ('OMF Bedding Edit - Mt Gravatt', 0.5::numeric),
      ('OMF Bedding Edit - Multi-Store Reel', 0.5::numeric),
      ('OMF Bedding Edit - Slacks Creek Store Highlight', 0.75::numeric),
      ('OMF Bedding Shoot - Mt Gravatt', 1.5::numeric),
      ('OMF Bedding Shoot - Slacks Creek Store Highlight', 1::numeric),
      ('OMF Bedding Shoot P1 Edit (P/V)', 0.5::numeric),
      ('OMF Bedding Shoot(B,B+,P1)', 2::numeric),
      ('OMF Bedding, Mt Gravatt & Slacks Creek Shoot', 3::numeric),
      ('OMF BTS Vlog', 1.5::numeric),
      ('OMF Feature Highlights - DCIM', 0.5::numeric),
      ('OMF Feature Video - Urban', 1.25::numeric),
      ('OMF Feature Video - Urban Lux', 1.25::numeric),
      ('OMF-Ironline Bedframe Video (H)', 0.25::numeric),
      ('OMF-Ironline Bedframe Video (V)', 0.25::numeric),
      ('OMF-Mandalay Bay Video (P) (H)', 0.25::numeric),
      ('OMF-Mandalay Bay Video (P) (V)', 0.25::numeric),
      ('OMF-Modern-Mornington Video (H)', 0.25::numeric),
      ('OMF-Modern-Mornington Video (V)', 0.25::numeric),
      ('OMF-Modern-Refresh Video (H)', 0.25::numeric),
      ('OMF-Modern-Refresh Video (V)', 0.25::numeric),
      ('OMF-MTG-BED1', 0.25::numeric),
      ('OMF-MTG-BED2', 0.25::numeric),
      ('OMF-MTG-BED3', 0.25::numeric),
      ('OMF-Revivify day Photos (All)', 1.75::numeric),
      ('OMF-Revivify day shoot time', 3.42::numeric),
      ('OMF-Revivify Firm Video (H)', 0.25::numeric),
      ('OMF-Revivify Firm Video (V)', 0.25::numeric),
      ('OMF-Revivify Soft Video (H)', 0.25::numeric),
      ('OMF-Revivify Soft Video (V)', 0.25::numeric),
      ('OMF-Revivify Support Video (H)', 0.25::numeric),
      ('OMF-Revivify Support Video (V)', 0.25::numeric),
      ('OMF-SLKS-BED1', 0.25::numeric),
      ('OMF-SLKS-BED2', 0.25::numeric),
      ('PB Short 2', 0.5::numeric),
      ('PB SHORT 3 (OMF)', 0.5::numeric),
      ('Postcards EdgePro', 0.5::numeric),
      ('RAVISH PB, LEND-IT BTS', 1::numeric)
  )
  update public."website-job-tasks" as task
  set
    hours = exported.hours,
    updated_by = (
      select admin_user.user_id
      from public."website-admin-users" as admin_user
      join public."website-workspaces" as workspace
        on workspace.id = admin_user.workspace_id
      where workspace.slug = 'trushot-media'
        and admin_user.role = 'owner'
      order by admin_user.created_at
      limit 1
    ),
    updated_at = now()
  from exported_hours as exported
  where task.workspace_id = (
      select workspace.id
      from public."website-workspaces" as workspace
      where workspace.slug = 'trushot-media'
    )
    and task.archived_at is null
    and task.hours is null
    and task.title = exported.title;

  get diagnostics updated_count = row_count;

  if updated_count <> 72 then
    raise exception 'Expected to reconcile 72 task-hour records, updated %', updated_count;
  end if;
end
$$;
