-- Cover the archive audit foreign key so user deletion and archive history
-- maintenance remain efficient as the request history grows.

create index "website-enquiries-archived-by-idx"
  on public."website-enquiries" (archived_by)
  where archived_by is not null;
