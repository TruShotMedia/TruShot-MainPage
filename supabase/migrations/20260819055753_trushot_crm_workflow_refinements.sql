begin;

-- Invoice dates drive the monthly reporting view. Existing imported invoices
-- inherit their original record date, while future invoices require a date.
update public."website-invoices"
set issue_date = created_at::date
where issue_date is null;

alter table public."website-invoices"
  alter column issue_date set default current_date,
  alter column issue_date set not null;

commit;
