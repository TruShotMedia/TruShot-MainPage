-- Keep the invoice status and its cash ledger in agreement.
-- Selecting "paid" records the remaining balance; recording a payment derives
-- either part_paid or paid from the actual amount received.

create or replace function "website-private"."website-settle-paid-invoice"()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  paid_cents bigint;
  outstanding_cents bigint;
  derived_status text;
begin
  if new.archived_at is not null then
    return new;
  end if;

  select coalesce(sum(payment.amount_cents), 0)::bigint
  into paid_cents
  from public."website-payments" payment
  where payment.invoice_id = new.id
    and payment.workspace_id = new.workspace_id;

  outstanding_cents := greatest(new.total_cents - paid_cents, 0);

  if new.status = 'paid' and outstanding_cents > 0 then
    insert into public."website-payments" (
      workspace_id,
      invoice_id,
      amount_cents,
      paid_at,
      method,
      reference
    ) values (
      new.workspace_id,
      new.id,
      outstanding_cents,
      now(),
      'status_settlement',
      'Automatically recorded when invoice was marked paid'
    );

    paid_cents := new.total_cents;
  end if;

  derived_status := case
    when new.status = 'void' then 'void'
    when new.total_cents = 0 and new.status = 'paid' then 'paid'
    when new.total_cents > 0 and paid_cents >= new.total_cents then 'paid'
    when paid_cents > 0 then 'part_paid'
    when new.status in ('paid', 'part_paid') then 'sent'
    else new.status
  end;

  if derived_status is distinct from new.status then
    update public."website-invoices"
    set status = derived_status
    where id = new.id
      and workspace_id = new.workspace_id;
  end if;

  return new;
end;
$$;

create or replace function "website-private"."website-sync-invoice-payment-status"()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_ids uuid[];
  target_invoice_id uuid;
  invoice_workspace_id uuid;
  invoice_total_cents bigint;
  invoice_status text;
  invoice_archived_at timestamptz;
  paid_cents bigint;
  derived_status text;
begin
  if tg_op = 'INSERT' then
    invoice_ids := array[new.invoice_id];
  elsif tg_op = 'DELETE' then
    invoice_ids := array[old.invoice_id];
  elsif old.invoice_id is distinct from new.invoice_id then
    invoice_ids := array[old.invoice_id, new.invoice_id];
  else
    invoice_ids := array[new.invoice_id];
  end if;

  foreach target_invoice_id in array invoice_ids
  loop
    select invoice.workspace_id, invoice.total_cents, invoice.status, invoice.archived_at
    into invoice_workspace_id, invoice_total_cents, invoice_status, invoice_archived_at
    from public."website-invoices" invoice
    where invoice.id = target_invoice_id;

    if not found or invoice_archived_at is not null or invoice_status = 'void' then
      continue;
    end if;

    select coalesce(sum(payment.amount_cents), 0)::bigint
    into paid_cents
    from public."website-payments" payment
    where payment.invoice_id = target_invoice_id
      and payment.workspace_id = invoice_workspace_id;

    derived_status := case
      when invoice_total_cents > 0 and paid_cents >= invoice_total_cents then 'paid'
      when paid_cents > 0 then 'part_paid'
      when invoice_status in ('paid', 'part_paid') then 'sent'
      else invoice_status
    end;

    if derived_status is distinct from invoice_status then
      update public."website-invoices"
      set status = derived_status
      where id = target_invoice_id
        and workspace_id = invoice_workspace_id;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function "website-private"."website-settle-paid-invoice"() from public, anon, authenticated;
revoke all on function "website-private"."website-sync-invoice-payment-status"() from public, anon, authenticated;

drop trigger if exists "website-invoices-settle-paid" on public."website-invoices";
create trigger "website-invoices-settle-paid"
after insert or update of status, total_cents on public."website-invoices"
for each row
execute function "website-private"."website-settle-paid-invoice"();

drop trigger if exists "website-payments-sync-invoice-status" on public."website-payments";
create trigger "website-payments-sync-invoice-status"
after insert or delete or update of amount_cents, invoice_id, workspace_id on public."website-payments"
for each row
execute function "website-private"."website-sync-invoice-payment-status"();

-- Reconcile records that were marked paid before the trigger existed. This is
-- intentionally idempotent: only the currently outstanding amount is inserted.
insert into public."website-payments" (
  workspace_id,
  invoice_id,
  amount_cents,
  paid_at,
  method,
  reference
)
select
  invoice.workspace_id,
  invoice.id,
  invoice.total_cents - coalesce(payment_totals.paid_cents, 0),
  coalesce(invoice.updated_at, invoice.issue_date::timestamptz, now()),
  'status_settlement',
  'Automatically recorded while reconciling an invoice already marked paid'
from public."website-invoices" invoice
left join lateral (
  select coalesce(sum(payment.amount_cents), 0)::bigint as paid_cents
  from public."website-payments" payment
  where payment.invoice_id = invoice.id
    and payment.workspace_id = invoice.workspace_id
) payment_totals on true
where invoice.archived_at is null
  and invoice.status = 'paid'
  and invoice.total_cents > coalesce(payment_totals.paid_cents, 0);

comment on function "website-private"."website-settle-paid-invoice"() is
  'Records any remaining invoice balance as a payment when the invoice is marked paid.';

comment on function "website-private"."website-sync-invoice-payment-status"() is
  'Derives part-paid and paid invoice statuses from the payment ledger.';
