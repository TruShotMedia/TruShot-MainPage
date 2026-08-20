-- Large portfolio and website videos upload directly to Supabase using TUS.
update storage.buckets
set file_size_limit = 209715200
where id = 'website-media';
