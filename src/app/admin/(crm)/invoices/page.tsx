import { CircleDollarSign, Info, Pencil, Plus } from "lucide-react";
import { createInvoice, recordInvoicePayment, updateInvoice } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { EmptyState } from "@/components/admin/empty-state";
import { InvoiceDeleteControl } from "@/components/admin/invoice-delete-control";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { getAdminContext, getInvoices } from "@/lib/data/admin";
import { brisbaneDateInput } from "@/lib/completed-date-filter";
import { formatCurrency, formatDate, todayDateInput } from "@/lib/format";
import { invoicePaymentTotals, type InvoiceStatus } from "@/lib/invoice-payments";

export default async function InvoicesPage() {
  const [invoices, context] = await Promise.all([getInvoices(), getAdminContext()]);
  if (!context) return null;
  const { data: clients } = await context.supabase.from("website-clients").select("id,name").is("archived_at", null).order("name");
  return (
    <>
      <PageHeader eyebrow="Accounts receivable" title="Invoices" description="Track invoice value, payments, dates and the allocation of value across linked jobs." actions={
        <ActionPopover action={createInvoice} summary={<><Plus size={16} /> New invoice</>} title="Create an invoice" formClassName="quick-form wide">
          <label>Invoice number<input name="invoice_number" required placeholder="INV-0012" /></label>
          <label>Client<select name="client_id"><option value="">No client</option>{(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label>Total AUD<input name="total_dollars" type="number" min="0" step="0.01" required /></label>
          <label>GST included AUD<input name="gst_dollars" type="number" min="0" step="0.01" defaultValue="0" required /></label>
          <label>Status<select name="status"><option value="draft">Draft</option><option value="sent">Sent</option><option value="viewed">Viewed</option><option value="paid">Paid — record full balance</option><option value="overdue">Overdue</option><option value="void">Void</option></select></label>
          <label>Invoice date<input name="issue_date" type="date" defaultValue={todayDateInput()} required /></label>
          <label>Due date<input name="due_date" type="date" /></label>
          <p className="form-span invoice-payment-help">Choosing Paid records the full invoice balance as received today. Use Record payment for partial or backdated payments.</p>
          <SubmitButton pendingLabel="Creating…">Create invoice</SubmitButton>
        </ActionPopover>
      } />
      <div className="formula-note"><Info size={17} /><p><strong>Suggested cash split:</strong> reserve 25% of every invoice for tax and make 75% available for owner withdrawals. These are planning allocations, not a final tax calculation.</p></div>
      {invoices.length ? <section className="admin-card table-card"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Invoice</th><th>Client</th><th>Invoice date</th><th>Due</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th><th>Suggested split</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {invoices.map((invoice: Record<string, unknown>) => {
          const payments = invoice.payments as Array<{
            id: string;
            amount_cents: number;
            paid_at: string;
            method: string | null;
            reference: string | null;
          }>;
          const client = invoice.client as { name?: string } | null;
          const total = Number(invoice.total_cents);
          const { paidCents: paid, balanceCents: balance } = invoicePaymentTotals(total, payments, invoice.status as InvoiceStatus);
          const latestPayment = [...payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0];
          const ownerWithdrawal = Math.round(total * .75);
          const taxHolding = total - ownerWithdrawal;
          return <tr key={invoice.id as string}>
            <td><strong>{invoice.invoice_number as string}</strong></td><td>{client?.name ?? "—"}</td><td>{formatDate(invoice.issue_date as string)}</td><td>{formatDate(invoice.due_date as string)}</td><td><span className={`status-pill status-${invoice.status}`}>{String(invoice.status).replace("_", " ")}</span></td><td><strong>{formatCurrency(total)}</strong></td><td><div className="invoice-payment-total"><strong>{formatCurrency(paid)}</strong>{latestPayment ? <small>{payments.length} payment{payments.length === 1 ? "" : "s"} · latest {formatDate(latestPayment.paid_at)}</small> : <small>No payments recorded</small>}</div></td><td><strong>{formatCurrency(balance)}</strong></td><td><div className="invoice-split"><span>Owner 75% <strong>{formatCurrency(ownerWithdrawal)}</strong></span><span>Tax 25% <strong>{formatCurrency(taxHolding)}</strong></span></div></td>
            <td>
              <div className="invoice-row-actions">
              {balance > 0 && invoice.status !== "void" ? <ActionPopover
                action={recordInvoicePayment}
                summary={<><CircleDollarSign size={14} /> Record payment</>}
                title={`Record payment for ${invoice.invoice_number as string}`}
                detailsClassName="row-editor"
                summaryClassName="admin-secondary-button"
                formClassName="quick-form wide"
              >
                <input type="hidden" name="invoice_id" value={invoice.id as string} />
                <div className="form-span invoice-payment-summary"><span>Outstanding balance</span><strong>{formatCurrency(balance)}</strong></div>
                <label>Amount received AUD<input name="amount_dollars" type="number" min="0.01" max={balance / 100} step="0.01" required defaultValue={(balance / 100).toFixed(2)} /></label>
                <label>Payment date<input name="paid_at" type="date" required defaultValue={todayDateInput()} /></label>
                <label>Method<select name="method" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label>
                <label>Reference<input name="reference" maxLength={160} placeholder="Optional bank or receipt reference" /></label>
                <p className="form-span invoice-payment-help">A partial amount marks the invoice Part paid. Recording the remaining balance marks it Paid automatically.</p>
                <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
              </ActionPopover> : null}
              <ActionPopover
                action={updateInvoice}
                summary={<><Pencil size={14} /> Edit</>}
                title={`Edit ${invoice.invoice_number as string}`}
                detailsClassName="row-editor"
                summaryClassName=""
                formClassName="quick-form wide"
              >
                <input type="hidden" name="id" value={invoice.id as string} />
                <label>Invoice number<input name="invoice_number" required defaultValue={invoice.invoice_number as string} /></label>
                <label>Client<select name="client_id" defaultValue={String(invoice.client_id ?? "")}><option value="">No client</option>{(clients ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label>Total AUD<input name="total_dollars" type="number" min="0" step="0.01" required defaultValue={total / 100} /></label>
                <label>GST included AUD<input name="gst_dollars" type="number" min="0" step="0.01" required defaultValue={Number(invoice.gst_cents ?? 0) / 100} /></label>
                <label>Status<select name="status" defaultValue={invoice.status as string}><option value="draft">Draft</option><option value="sent">Sent</option><option value="viewed">Viewed</option><option value="part_paid" disabled>Part paid — managed by payments</option><option value="paid">Paid — record remaining balance</option><option value="overdue">Overdue</option><option value="void">Void</option></select></label>
                <label>Invoice date<input name="issue_date" type="date" required defaultValue={invoice.issue_date as string} /></label>
                <label>Due date<input name="due_date" type="date" defaultValue={String(invoice.due_date ?? "")} /></label>
                <label className="form-span">Notes<textarea name="notes" rows={3} defaultValue={String(invoice.notes ?? "")} /></label>
                {payments.length ? (
                  <fieldset className="form-span invoice-payment-date-editor">
                    <legend>Recorded payments</legend>
                    <p>Correct the received date for any payment without changing its amount.</p>
                    {payments.map((payment, index) => (
                      <div className="invoice-payment-date-row" key={payment.id}>
                        <input type="hidden" name="payment_ids" value={payment.id} />
                        <span>
                          <strong>Payment {index + 1} · {formatCurrency(payment.amount_cents)}</strong>
                          <small>{payment.method?.replaceAll("_", " ") ?? "Payment"}{payment.reference ? ` · ${payment.reference}` : ""}</small>
                        </span>
                        <label>
                          Date received
                          <input name="payment_paid_at" type="date" required defaultValue={brisbaneDateInput(payment.paid_at)} />
                        </label>
                      </div>
                    ))}
                  </fieldset>
                ) : null}
                <label>
                  New balance payment date
                  <input name="settlement_paid_at" type="date" defaultValue={todayDateInput()} />
                  <small>Used only when Paid records a remaining balance.</small>
                </label>
                <p className="form-span invoice-payment-help">Choosing Paid records any remaining balance on the selected payment date. Existing payment amounts are always preserved.</p>
                <SubmitButton pendingLabel="Saving…">Save invoice</SubmitButton>
              </ActionPopover>
              <InvoiceDeleteControl invoiceId={invoice.id as string} invoiceNumber={invoice.invoice_number as string} />
              </div>
            </td>
          </tr>;
        })}
      </tbody></table></div></section> : <EmptyState title="No invoices yet" description="Create an invoice or import the existing invoice CSV to activate revenue and job-value reporting." />}
    </>
  );
}
