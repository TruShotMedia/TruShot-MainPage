import { Plus } from "lucide-react";
import { createExpense } from "@/app/admin/actions";
import { AdminChart } from "@/components/admin/chart";
import { PageHeader } from "@/components/admin/page-header";
import { TaxEstimator } from "@/components/admin/tax-estimator";
import { getFinanceData } from "@/lib/data/admin";
import { formatCurrency } from "@/lib/format";

export default async function FinancePage() {
  const data = await getFinanceData();
  if (!data) return null;
  const overview = data.overview as { invoiced_cents?: number; paid_cents?: number; outstanding_cents?: number } | null;
  const monthly = new Map<string, { income: number; expenses: number }>();
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(); date.setMonth(date.getMonth() - i);
    monthly.set(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, { income: 0, expenses: 0 });
  }
  data.invoices.forEach((invoice: Record<string, unknown>) => { if (!invoice.issue_date) return; const key = String(invoice.issue_date).slice(0, 7); const item = monthly.get(key); if (item) item.income += Number(invoice.total_cents) / 100; });
  data.expenses.forEach((expense: Record<string, unknown>) => { const key = String(expense.incurred_on).slice(0, 7); const item = monthly.get(key); if (item) item.expenses += Number(expense.amount_cents) / 100; });
  const labels = [...monthly.keys()].map((key) => new Intl.DateTimeFormat("en-AU", { month: "short" }).format(new Date(`${key}-02`)));
  const chartOption = { animationDuration: 700, color: ["#1f5e41", "#d5aa52"], grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true }, tooltip: { trigger: "axis" }, legend: { right: 0, textStyle: { color: "#74786f" } }, xAxis: { type: "category", data: labels, axisLine: { show: false }, axisTick: { show: false } }, yAxis: { type: "value", splitLine: { lineStyle: { color: "#eceae3" } } }, series: [{ name: "Income", type: "bar", data: [...monthly.values()].map((item) => item.income), barMaxWidth: 22, borderRadius: [7,7,0,0] }, { name: "Expenses", type: "bar", data: [...monthly.values()].map((item) => item.expenses), barMaxWidth: 22, borderRadius: [7,7,0,0] }] };
  const expenseCents = data.expenses.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.amount_cents), 0);
  const gstCollected = data.invoices.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.gst_cents), 0);
  const gstCredits = data.expenses.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.gst_credit_cents), 0);

  return (
    <>
      <PageHeader eyebrow="Financial control" title="Finance & Tax" description="See cash, profit, expenses and a practical sole-trader tax reserve without losing the underlying detail." actions={<details className="action-popover"><summary className="admin-primary-button"><Plus size={16} /> Add expense</summary><form action={createExpense} className="quick-form wide"><h3>Record an expense</h3><label>Vendor<input name="vendor" required /></label><label>Amount AUD<input name="amount_dollars" type="number" min="0" step="0.01" required /></label><label>GST credit AUD<input name="gst_credit_dollars" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Date<input name="incurred_on" type="date" required /></label><label className="form-span">Description<input name="description" /></label><button className="admin-primary-button" type="submit">Save expense</button></form></details>} />
      <section className="finance-kpis"><article><p>Invoiced</p><strong>{formatCurrency(overview?.invoiced_cents)}</strong><span>Excluding void invoices</span></article><article><p>Received</p><strong>{formatCurrency(overview?.paid_cents)}</strong><span>Payments recorded</span></article><article><p>Expenses</p><strong>{formatCurrency(expenseCents)}</strong><span>Deductibility before adjustments</span></article><article><p>Gross margin</p><strong>{formatCurrency(Number(overview?.invoiced_cents ?? 0) - expenseCents)}</strong><span>Invoice value less expenses</span></article></section>
      <section className="admin-card chart-card finance-chart"><div className="card-heading"><div><p>Last six months</p><h2>Income vs expenses</h2></div></div><AdminChart option={chartOption} height={330} /></section>
      <TaxEstimator revenueCents={Number(overview?.invoiced_cents ?? 0)} expenseCents={expenseCents} gstCollectedCents={gstCollected} gstCreditsCents={gstCredits} isGstRegistered={Boolean(data.taxSettings?.is_gst_registered)} />
    </>
  );
}
