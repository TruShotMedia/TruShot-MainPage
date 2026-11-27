set local lock_timeout = '5s';

alter table public."website-calendar-events"
  add column post_completed_at timestamptz,
  add constraint "website-calendar-events-post-completion-check"
    check (post_completed_at is null or event_kind = 'post');
