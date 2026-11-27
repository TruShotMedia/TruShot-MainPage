-- Posts use the same workspace permissions and lifecycle as calendar events.
set local lock_timeout = '5s';

alter table public."website-calendar-events"
  add column event_kind text not null default 'event',
  add constraint "website-calendar-events-kind-check"
    check (event_kind in ('event', 'post'));
