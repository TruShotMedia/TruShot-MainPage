import { Plus } from "lucide-react";
import { createExpense } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { AdminChart } from "@/components/admin/chart";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { TaxEstimator } from "@/components/admin/tax-estimator";
import { getFinanceData } from "@/lib/data/admin";
import { formatCurrency } from "@/lib/format";

export default async function FinancePage() {
  const data = await getFinanceData();
  if (!data) return null;
  const overview = data.overview as { invoiced_cents?: number; paid_cents?: number; outstanding_cents?: number } | null;
  const monthly = new Map<string, number>();
  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - i);
    monthly.set(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  data.invoices.forEach((invoice: Record<string, unknown>) => {
    if (!invoice.issue_date) return;
    const key = String(invoice.issue_date).slice(0, 7);
    if (monthly.has(key)) monthly.set(key, (monthly.get(key) ?? 0) + Number(invoice.total_cents) / 100);
  });
  const labels = [...monthly.keys()].map((key) => new Intl.DateTimeFormat("en-AU", { month: "short", year: "2-digit" }).format(new Date(`${key}-02T00:00:00+10:00`)));
  const chartOption = { animationDuration: 700, grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: labels, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#7b8078" } }, yAxis: { type: "value", splitLine: { lineStyle: { color: "#eceae3" } }, axisLabel: { color: "#9a9e97" } }, series: [{ name: "Invoice income", type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: [...monthly.values()], lineStyle: { color: "#1f5e41", width: 3 }, itemStyle: { color: "#1f5e41" }, areaStyle: { color: "rgba(31,94,65,.12)" } }] };
  const expenseCents = data.expenses.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.amount_cents), 0);
  const gstCollected = data.invoices.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.gst_cents), 0);
  const gstCredits = data.expenses.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.gst_credit_cents), 0);

  return (
    <>
      <PageHeader eyebrow="Financial control" title="Finance & Tax" description="See cash, profit, expenses and a practical sole-trader tax reserve without losing the underlying detail." actions={
        <ActionPopover action={createExpense} summary={<><Plus size={16} /> Add expense</>} title="Record an expense" formClassName="quick-form wide">
          <label>Vendor<input name="vendor" required /></label>
          <label>Amount AUD<input name="amount_dollars" type="number" min="0" step="0.01" required /></label>
          <label>GST credit AUD<input name="gst_credit_dollars" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <label>Date<input name="incurred_on" type="date" required /></label>
          <label className="form-span">Description<input name="description" /></label>
          <SubmitButton pendingLabel="Saving…">Save expense</SubmitButton>
        </ActionPopover>
      } />
      <section className="finance-kpis"><article><p>Invoiced</p><strong>{formatCurrency(overview?.invoiced_cents)}</strong><span>Excluding void invoices</span></article><article><p>Received</p><strong>{formatCurrency(overview?.paid_cents)}</strong><span>Payments recorded</span></article><article><p>Expenses</p><strong>{formatCurrency(expenseCents)}</strong><span>Deductibility before adjustments</span></article><article><p>Gross margin</p><strong>{formatCurrency(Number(overview?.invoiced_cents ?? 0) - expenseCents)}</strong><span>Invoice value less expenses</span></article></section>
      <section className="admin-card chart-card finance-chart"><div className="card-heading"><div><p>Last 12 months</p><h2>Month-to-month invoice income</h2></div><span>Invoice date basis</span></div><AdminChart option={chartOption} height={330} /></section>
      <TaxEstimator revenueCents={Number(overview?.invoiced_cents ?? 0)} expenseCents={expenseCents} gstCollectedCents={gstCollected} gstCreditsCents={gstCredits} isGstRegistered={Boolean(data.taxSettings?.is_gst_registered)} />
    </>
  );
}
