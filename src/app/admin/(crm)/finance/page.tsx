import Link from "next/link";
import { Archive, ArrowUpRight, FileBarChart, Paperclip } from "lucide-react";
import { archiveExpense } from "@/app/admin/actions";
import { AdminChart } from "@/components/admin/chart";
import { ExpenseCapture } from "@/components/admin/expense-capture";
import { PageHeader } from "@/components/admin/page-header";
import { TaxEstimator } from "@/components/admin/tax-estimator";
import { getFinanceData } from "@/lib/data/admin";
import { buildReceivablesAgeing } from "@/lib/finance";
import { formatCurrency, todayDateInput } from "@/lib/format";

type Summary = { id: string; label: string; revenueCents: number; expenseCents: number };

function monthKey(value: string) { return value.slice(0, 7); }

function addSummary(map: Map<string, Summary>, id: string, label: string, revenueCents = 0, expenseCents = 0) {
  const current = map.get(id) ?? { id, label, revenueCents: 0, expenseCents: 0 };
  current.revenueCents += revenueCents;
  current.expenseCents += expenseCents;
  map.set(id, current);
}

function ProfitabilityTable({ title, eyebrow, rows }: { title: string; eyebrow: string; rows: Summary[] }) {
  const sorted = [...rows].sort((a, b) => (b.revenueCents - b.expenseCents) - (a.revenueCents - a.expenseCents)).slice(0, 6);
  return <article className="admin-card profitability-card"><div><p className="card-label">{eyebrow}</p><h2>{title}</h2></div>{sorted.length ? <div className="profitability-list">{sorted.map((row) => { const profit = row.revenueCents - row.expenseCents; const margin = row.revenueCents > 0 ? profit / row.revenueCents * 100 : 0; return <div key={row.id}><span><strong>{row.label}</strong><small>{formatCurrency(row.revenueCents)} revenue · {formatCurrency(row.expenseCents)} cost</small></span><b>{formatCurrency(profit)}<small>{Math.round(margin)}% margin</small></b></div>; })}</div> : <p className="muted-copy">Linked revenue and expenses will appear here.</p>}</article>;
}

export default async function FinancePage() {
  const data = await getFinanceData();
  if (!data) return null;
  const issuedInvoices = data.invoices.filter((invoice) => invoice.status !== "draft" && invoice.status !== "void");
  const issuedInvoiceIds = new Set(issuedInvoices.map((invoice) => invoice.id));
  const issuedPayments = data.payments.filter((payment) => issuedInvoiceIds.has(payment.invoice_id));
  const invoicedCents = issuedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_cents), 0);
  const paidCents = issuedPayments.reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
  const outstandingCents = Math.max(0, invoicedCents - paidCents);
  const monthly = new Map<string, { issued: number; paid: number }>();
  const [currentYear, currentMonth] = todayDateInput().split("-").map(Number);
  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(currentYear, currentMonth - 1 - i, 1));
    monthly.set(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`, { issued: 0, paid: 0 });
  }
  issuedInvoices.forEach((invoice) => { const bucket = monthly.get(monthKey(invoice.issue_date)); if (bucket) bucket.issued += Number(invoice.total_cents) / 100; });
  issuedPayments.forEach((payment) => { const bucket = monthly.get(monthKey(payment.paid_at)); if (bucket) bucket.paid += Number(payment.amount_cents) / 100; });
  const labels = [...monthly.keys()].map((key) => new Intl.DateTimeFormat("en-AU", { month: "short", year: "2-digit" }).format(new Date(`${key}-02T00:00:00+10:00`)));
  const chartOption = {
    animationDuration: 700,
    grid: { left: 8, right: 8, top: 30, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: "#777d76", fontSize: 10 } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: labels, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#7b8078" } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#eceae3" } }, axisLabel: { color: "#9a9e97", formatter: "${value}" } },
    series: [
      { name: "Issued", type: "line", smooth: true, symbol: "circle", symbolSize: 7, data: [...monthly.values()].map((value) => value.issued), lineStyle: { color: "#1f5e41", width: 3 }, itemStyle: { color: "#1f5e41" }, areaStyle: { color: "rgba(31,94,65,.10)" } },
      { name: "Paid", type: "line", smooth: true, symbol: "circle", symbolSize: 7, data: [...monthly.values()].map((value) => value.paid), lineStyle: { color: "#b06b45", width: 2 }, itemStyle: { color: "#b06b45" } },
    ],
  };
  const expenseCents = data.expenses.reduce((sum, item) => sum + Number(item.amount_cents), 0);
  const gstCollected = issuedInvoices.reduce((sum, item) => sum + Number(item.gst_cents), 0);
  const gstCredits = data.expenses.reduce((sum, item) => sum + Number(item.gst_credit_cents), 0);
  const ageing = buildReceivablesAgeing(issuedInvoices, issuedPayments);
  const clientById = new Map(data.clients.map((client) => [client.id, client]));
  const packageById = new Map(data.packages.map((item) => [item.id, item.title]));
  const clients = new Map<string, Summary>();
  const packages = new Map<string, Summary>();
  issuedInvoices.forEach((invoice) => {
    if (!invoice.client_id) return;
    const client = clientById.get(invoice.client_id);
    addSummary(clients, invoice.client_id, client?.name ?? "Unknown client", Number(invoice.total_cents), 0);
    const packageId = client?.package_id ?? "unassigned";
    addSummary(packages, packageId, packageId === "unassigned" ? "No package" : packageById.get(packageId) ?? "Unknown package", Number(invoice.total_cents), 0);
  });
  data.expenses.forEach((expense) => {
    if (expense.client_id) {
      const client = clientById.get(expense.client_id);
      addSummary(clients, expense.client_id, client?.name ?? "Unknown client", 0, Number(expense.amount_cents));
      const packageId = client?.package_id ?? "unassigned";
      addSummary(packages, packageId, packageId === "unassigned" ? "No package" : packageById.get(packageId) ?? "Unknown package", 0, Number(expense.amount_cents));
    }
  });
  const campaigns = new Map<string, Summary>();
  const campaignById = new Map(data.campaigns.map((campaign) => [campaign.id, campaign.title]));
  const campaignIdsByInvoice = new Map<string, Set<string>>();
  data.campaignAssets.forEach((asset) => { if (asset.invoice_id) campaignIdsByInvoice.set(asset.invoice_id, new Set([...(campaignIdsByInvoice.get(asset.invoice_id) ?? []), asset.campaign_id])); });
  issuedInvoices.forEach((invoice) => {
    const linked = [...(campaignIdsByInvoice.get(invoice.id) ?? [])];
    if (!linked.length) return;
    const share = Math.round(Number(invoice.total_cents) / linked.length);
    linked.forEach((campaignId) => addSummary(campaigns, campaignId, campaignById.get(campaignId) ?? "Unknown campaign", share, 0));
  });
  data.expenses.forEach((expense) => { if (expense.campaign_id) addSummary(campaigns, expense.campaign_id, campaignById.get(expense.campaign_id) ?? "Unknown campaign", 0, Number(expense.amount_cents)); });

  return (
    <>
      <PageHeader eyebrow="Financial control" title="Finance & Tax" description="Track issued and received cash, receivables, attributed profitability, expenses and accountant-ready planning estimates." actions={<div className="page-action-row"><Link href="/admin/finance/reports" className="admin-secondary-button"><FileBarChart size={16} /> Reports</Link><ExpenseCapture categories={data.categories} clients={data.clients} jobs={data.jobs} campaigns={data.campaigns} /></div>} />
      <section className="finance-kpis"><article><p>Invoiced</p><strong>{formatCurrency(invoicedCents)}</strong><span>Issued, excluding draft and void invoices</span></article><article><p>Cash received</p><strong>{formatCurrency(paidCents)}</strong><span>Payments recorded</span></article><article><p>Receivables</p><strong>{formatCurrency(outstandingCents)}</strong><span>Invoice value still unpaid</span></article><article><p>Gross margin</p><strong>{formatCurrency(invoicedCents - expenseCents)}</strong><span>Invoiced value less recorded costs</span></article></section>
      <section className="finance-primary-grid">
        <article className="admin-card chart-card finance-chart"><div className="card-heading"><div><p>Cashflow</p><h2>Issued versus paid</h2></div><span>Last 12 months</span></div><AdminChart option={chartOption} height={330} /></article>
        <article className="admin-card ageing-card"><div><p className="card-label">Accounts receivable</p><h2>Outstanding ageing</h2></div><div className="ageing-list"><div><span>Current</span><strong>{formatCurrency(ageing.current)}</strong></div><div><span>1–30 days</span><strong>{formatCurrency(ageing.days1to30)}</strong></div><div><span>31–60 days</span><strong>{formatCurrency(ageing.days31to60)}</strong></div><div><span>61–90 days</span><strong>{formatCurrency(ageing.days61to90)}</strong></div><div className={ageing.days90plus ? "is-alert" : ""}><span>90+ days</span><strong>{formatCurrency(ageing.days90plus)}</strong></div></div></article>
      </section>
      <section className="profitability-grid"><ProfitabilityTable eyebrow="Relationship economics" title="Profitability by client" rows={[...clients.values()]} /><ProfitabilityTable eyebrow="Offer performance" title="Profitability by package" rows={[...packages.values()]} /><ProfitabilityTable eyebrow="Campaign economics" title="Profitability by campaign" rows={[...campaigns.values()]} /></section>
      <section className="admin-card expense-ledger"><div className="card-heading"><div><p>Expense ledger</p><h2>Receipts and deductible costs</h2></div><Link href="/admin/finance/reports">Open tax report <ArrowUpRight size={13} /></Link></div>{data.expenses.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Vendor</th><th>Category / relation</th><th>Gross</th><th>GST credit</th><th>Receipt</th><th /></tr></thead><tbody>{data.expenses.map((expense) => <tr key={expense.id}><td>{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${expense.incurred_on}T00:00:00+10:00`))}</td><td><strong>{expense.vendor}</strong><small>{expense.description ?? "No description"}</small></td><td>{expense.category?.name ?? "Uncategorised"}<small>{expense.job?.name ?? expense.campaign?.name ?? expense.client?.name ?? "General business"}</small></td><td><strong>{formatCurrency(expense.amount_cents)}</strong><small>{expense.deductible_percent}% deductible</small></td><td>{formatCurrency(expense.gst_credit_cents)}</td><td>{expense.receipt_signed_url ? <a className="receipt-link" href={expense.receipt_signed_url} target="_blank" rel="noreferrer"><Paperclip size={13} /> View</a> : <span className="muted-copy">None</span>}</td><td><form action={archiveExpense}><input type="hidden" name="id" value={expense.id} /><button className="icon-table-action" title="Archive expense" aria-label={`Archive ${expense.vendor} expense`}><Archive size={14} /></button></form></td></tr>)}</tbody></table></div> : <div className="expense-empty"><p>No expenses recorded yet.</p><span>Add a receipt or manual expense to begin profitability and GST reporting.</span></div>}</section>
      <TaxEstimator revenueCents={invoicedCents} expenseCents={expenseCents} gstCollectedCents={gstCollected} gstCreditsCents={gstCredits} isGstRegistered={Boolean(data.taxSettings?.is_gst_registered)} />
    </>
  );
}
