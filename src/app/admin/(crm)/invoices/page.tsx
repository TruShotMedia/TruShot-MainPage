import { Info, Plus } from "lucide-react";
import { createInvoice } from "@/app/admin/actions";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { getAdminContext, getInvoices } from "@/lib/data/admin";
import { formatCurrency, formatDate, todayDateInput } from "@/lib/format";

export default async function InvoicesPage() {
  const [invoices, context] = await Promise.all([getInvoices(), getAdminContext()]);
  if (!context) return null;
  const { data: clients } = await context.supabase.from("website-clients").select("id,name").is("archived_at", null).order("name");
  return (
    <>
      <PageHeader eyebrow="Accounts receivable" title="Invoices" description="Track invoice value, payments, dates and the allocation of value across linked jobs." actions={
        <details className="action-popover"><summary className="admin-primary-button"><Plus size={16} /> New invoice</summary><form action={createInvoice} className="quick-form wide"><h3>Create an invoice</h3><label>Invoice number<input name="invoice_number" required placeholder="INV-0012" /></label><label>Client<select name="client_id"><option value="">No client</option>{(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Total AUD<input name="total_dollars" type="number" min="0" step="0.01" required /></label><label>Status<select name="status"><option value="draft">Draft</option><option value="sent">Sent</option><option value="viewed">Viewed</option><option value="part_paid">Part paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="void">Void</option></select></label><label>Invoice date<input name="issue_date" type="date" defaultValue={todayDateInput()} required /></label><label>Due date<input name="due_date" type="date" /></label><SubmitButton pendingLabel="Creating…">Create invoice</SubmitButton></form></details>
      } />
      <div className="formula-note"><Info size={17} /><p><strong>Suggested cash split:</strong> reserve 25% of every invoice for tax and make 75% available for owner withdrawals. These are planning allocations, not a final tax calculation.</p></div>
      {invoices.length ? <section className="admin-card table-card"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Invoice</th><th>Client</th><th>Invoice date</th><th>Due</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th><th>Suggested split</th></tr></thead><tbody>
        {invoices.map((invoice: Record<string, unknown>) => {
          const payments = invoice.payments as { amount_cents: number }[];
          const paid = payments.reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
          const client = invoice.client as { name?: string } | null;
          const total = Number(invoice.total_cents);
          const ownerWithdrawal = Math.round(total * .75);
          const taxHolding = total - ownerWithdrawal;
          return <tr key={invoice.id as string}><td><strong>{invoice.invoice_number as string}</strong></td><td>{client?.name ?? "—"}</td><td>{formatDate(invoice.issue_date as string)}</td><td>{formatDate(invoice.due_date as string)}</td><td><span className={`status-pill status-${invoice.status}`}>{String(invoice.status).replace("_", " ")}</span></td><td><strong>{formatCurrency(total)}</strong></td><td>{formatCurrency(paid)}</td><td>{formatCurrency(total - paid)}</td><td><div className="invoice-split"><span>Owner 75% <strong>{formatCurrency(ownerWithdrawal)}</strong></span><span>Tax 25% <strong>{formatCurrency(taxHolding)}</strong></span></div></td></tr>;
        })}
      </tbody></table></div></section> : <EmptyState title="No invoices yet" description="Create an invoice or import the existing invoice CSV to activate revenue and job-value reporting." />}
    </>
  );
}
