-- Keep the public website media bucket restrictive while accepting QuickTime MOV uploads.
update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/mov',
  'video/x-quicktime',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
]::text[]
where id = 'website-media';

alter policy "website-media-member-insert"
on storage.objects
with check (
  bucket_id = 'website-media'
  and (storage.foldername(name))[1] = '11111111-1111-4111-8111-111111111111'
  and lower(storage.extension(name)) in ('mp4', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'avif')
  and (select "website-private"."website-has-workspace-access"('11111111-1111-4111-8111-111111111111'::uuid))
);
