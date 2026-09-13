import Link from "next/link";
import { AlertTriangle, ArrowLeft, Landmark, ReceiptText, ShoppingBag, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ReportExportButtons } from "@/components/admin/report-export-buttons";
import { getFinanceData } from "@/lib/data/admin";
import { buildBasEstimate, dateInRange } from "@/lib/finance";
import { formatCurrency, todayDateInput } from "@/lib/format";

function currentQuarter() {
  const [year, month] = todayDateInput().split("-").map(Number);
  const startMonth = Math.floor((month - 1) / 3) * 3;
  const from = new Date(Date.UTC(year, startMonth, 1));
  const to = new Date(Date.UTC(year, startMonth + 3, 0));
  return { from: utcDateKey(from), to: utcDateKey(to) };
}

function utcDateKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function safeDate(value: string | undefined, fallback: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : fallback; }

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const data = await getFinanceData();
  if (!data) return null;
  const defaults = currentQuarter();
  const params = await searchParams;
  const from = safeDate(params.from, defaults.from);
  const to = safeDate(params.to, defaults.to);
  const rangeFrom = from <= to ? from : to;
  const rangeTo = from <= to ? to : from;
  const basis = data.taxSettings?.estimate_basis === "accrual" ? "accrual" : "cash";
  const isGstRegistered = Boolean(data.taxSettings?.is_gst_registered);
  const estimate = buildBasEstimate({ invoices: data.invoices, payments: data.payments, expenses: data.expenses, from: rangeFrom, to: rangeTo, basis, isGstRegistered });
  const periodExpenses = data.expenses.filter((expense) => dateInRange(expense.incurred_on, rangeFrom, rangeTo));
  const validInvoiceIds = new Set(data.invoices.filter((invoice) => invoice.status !== "draft" && invoice.status !== "void").map((invoice) => invoice.id));
  const periodInvoices = data.invoices.filter((invoice) => validInvoiceIds.has(invoice.id) && dateInRange(invoice.issue_date, rangeFrom, rangeTo));
  const periodPayments = data.payments.filter((payment) => validInvoiceIds.has(payment.invoice_id) && dateInRange(payment.paid_at, rangeFrom, rangeTo));
  const invoiceById = new Map(data.invoices.map((invoice) => [invoice.id, invoice]));
  const exportRows = [
    ...periodInvoices.map((invoice) => ({ Type: "Invoice issued", Date: invoice.issue_date, Reference: invoice.invoice_number, Description: invoice.status, Gross_AUD: (Number(invoice.total_cents) / 100).toFixed(2), GST_AUD: (Number(invoice.gst_cents) / 100).toFixed(2), Deductible_percent: "", Evidence: "" })),
    ...periodPayments.map((payment) => ({ Type: "Payment received", Date: payment.paid_at.slice(0, 10), Reference: invoiceById.get(payment.invoice_id)?.invoice_number ?? payment.invoice_id, Description: payment.method ?? "Payment", Gross_AUD: (Number(payment.amount_cents) / 100).toFixed(2), GST_AUD: "", Deductible_percent: "", Evidence: payment.reference ?? "" })),
    ...periodExpenses.map((expense) => ({ Type: "Expense", Date: expense.incurred_on, Reference: expense.vendor, Description: expense.description ?? expense.category?.name ?? "Business expense", Gross_AUD: (Number(expense.amount_cents) / 100).toFixed(2), GST_AUD: (Number(expense.gst_credit_cents) / 100).toFixed(2), Deductible_percent: String(expense.deductible_percent), Evidence: expense.receipt_file_name ?? "No receipt attached" })),
  ].sort((a, b) => a.Date.localeCompare(b.Date));
  const displayPeriod = `${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${rangeFrom}T00:00:00+10:00`))} – ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${rangeTo}T00:00:00+10:00`))}`;

  return <>
    <PageHeader eyebrow="Finance reporting" title="Tax & BAS report" description="Build a date-bounded transaction record, review GST planning labels, then export the detail for your accountant." actions={<div className="page-action-row"><Link className="admin-secondary-button" href="/admin/finance"><ArrowLeft size={15} /> Finance</Link><ReportExportButtons rows={exportRows} fileName={`trushot-finance-${rangeFrom}-to-${rangeTo}.csv`} /></div>} />
    <form className="admin-card report-range-form" method="get"><label>From<input type="date" name="from" defaultValue={rangeFrom} /></label><label>To<input type="date" name="to" defaultValue={rangeTo} /></label><button className="admin-primary-button">Build report</button><span>{displayPeriod} · {basis} GST basis</span></form>
    <section className="report-kpis"><article><span><WalletCards size={18} /></span><p>G1 total sales</p><strong>{formatCurrency(estimate.totalSalesCents)}</strong><small>{basis === "cash" ? "Payments received" : "Invoices issued"}</small></article><article><span><Landmark size={18} /></span><p>1A GST on sales</p><strong>{formatCurrency(estimate.gstOnSalesCents)}</strong><small>{isGstRegistered ? "Estimated report label" : "GST not enabled"}</small></article><article><span><ReceiptText size={18} /></span><p>1B GST credits</p><strong>{formatCurrency(estimate.gstCreditsCents)}</strong><small>Entered claimable GST</small></article><article className={estimate.netGstCents > 0 ? "is-payable" : ""}><span><ShoppingBag size={18} /></span><p>Net GST</p><strong>{formatCurrency(estimate.netGstCents)}</strong><small>1A less 1B</small></article></section>
    <section className="report-purchase-grid"><article className="admin-card"><p className="card-label">Purchase classification</p><h2>Capital purchases · G10</h2><strong>{formatCurrency(estimate.capitalPurchasesCents)}</strong><span>Expenses categorised as equipment or depreciating assets.</span></article><article className="admin-card"><p className="card-label">Purchase classification</p><h2>Non-capital purchases · G11</h2><strong>{formatCurrency(estimate.nonCapitalPurchasesCents)}</strong><span>Other recorded deductible business purchases.</span></article></section>
    <section className="admin-card report-detail"><div className="card-heading"><div><p>Supporting ledger</p><h2>Transactions in this report</h2></div><span>{exportRows.length} records</span></div>{exportRows.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th>Gross</th><th>GST</th><th>Evidence</th></tr></thead><tbody>{exportRows.map((row, index) => <tr key={`${row.Type}-${row.Date}-${index}`}><td>{row.Date}</td><td>{row.Type}</td><td><strong>{row.Reference}</strong></td><td>{row.Description}</td><td>{row.Gross_AUD ? `$${row.Gross_AUD}` : "—"}</td><td>{row.GST_AUD ? `$${row.GST_AUD}` : "—"}</td><td>{row.Evidence || "—"}</td></tr>)}</tbody></table></div> : <div className="expense-empty"><p>No transactions in this date range.</p><span>Adjust the dates or begin recording invoices, payments and expenses.</span></div>}</section>
    <div className="tax-report-disclaimer"><AlertTriangle size={17} /><p><strong>Planning report only.</strong> BAS timing depends on the GST accounting basis registered for your business. GST credits require eligible business purchases and appropriate evidence; deductible percentages and OCR suggestions must be reviewed. Confirm all lodgement figures with your accountant or registered tax agent.</p></div>
  </>;
}
