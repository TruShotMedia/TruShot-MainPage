import { ArrowUpRight, BriefcaseBusiness, CircleDollarSign, ClipboardList, UsersRound } from "lucide-react";
import Link from "next/link";
import { AdminChart } from "@/components/admin/chart";
import { EmptyState } from "@/components/admin/empty-state";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { getOverviewData } from "@/lib/data/admin";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function OverviewPage() {
  const data = await getOverviewData();
  if (!data) return null;
  const finance = data.finance as { invoiced_cents?: number; paid_cents?: number; outstanding_cents?: number } | null;
  const invoiceRows = data.invoices as { issue_date?: string; total_cents: number; status: string }[];
  const monthly = new Map<string, number>();
  invoiceRows.forEach((invoice) => {
    if (!invoice.issue_date || invoice.status === "void") return;
    const key = new Intl.DateTimeFormat("en-AU", { month: "short" }).format(new Date(invoice.issue_date));
    monthly.set(key, (monthly.get(key) ?? 0) + Number(invoice.total_cents) / 100);
  });

  const chartOption = {
    animationDuration: 700,
    grid: { left: 8, right: 8, top: 25, bottom: 5, containLabel: true },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: [...monthly.keys()], boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#7b8078" } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#eceae3" } }, axisLabel: { color: "#9a9e97" } },
    series: [{ type: "line", smooth: true, symbol: "circle", symbolSize: 8, data: [...monthly.values()], lineStyle: { color: "#1f5e41", width: 3 }, itemStyle: { color: "#1f5e41" }, areaStyle: { color: "rgba(31,94,65,.12)" } }],
  };

  return (
    <>
      <PageHeader eyebrow="Command centre" title="Good morning." description="A clear view of what is moving, what needs attention, and what the work is worth." actions={<Link className="admin-primary-button" href="/admin/pipeline">Open pipeline <ArrowUpRight size={16} /></Link>} />
      <section className="metric-grid">
        <MetricCard label="Active clients" value={String(data.counts.clients)} note="Across the workspace" icon={UsersRound} />
        <MetricCard label="Jobs" value={String(data.counts.jobs)} note={`${data.counts.tasks} created assets`} icon={BriefcaseBusiness} tone="ink" />
        <MetricCard label="Invoiced" value={formatCurrency(finance?.invoiced_cents)} note={`${formatCurrency(finance?.outstanding_cents)} outstanding`} icon={CircleDollarSign} tone="gold" />
        <MetricCard label="New requests" value={String(data.counts.enquiries)} note="Waiting for review" icon={ClipboardList} tone="lilac" />
      </section>

      <section className="dashboard-grid">
        <article className="admin-card chart-card">
          <div className="card-heading"><div><p>Revenue movement</p><h2>Invoice value</h2></div><span>All time</span></div>
          {monthly.size ? <AdminChart option={chartOption} /> : <EmptyState title="No invoice trend yet" description="Create or import invoices and the revenue curve will appear here." />}
        </article>
        <article className="admin-card finance-snapshot">
          <p className="card-label">Cash snapshot</p>
          <h2>{formatCurrency(finance?.paid_cents)}</h2>
          <span>received</span>
          <div className="cash-bar"><i style={{ width: finance?.invoiced_cents ? `${Math.min(100, Number(finance.paid_cents ?? 0) / Number(finance.invoiced_cents) * 100)}%` : "0%" }} /></div>
          <dl>
            <div><dt>Invoiced</dt><dd>{formatCurrency(finance?.invoiced_cents)}</dd></div>
            <div><dt>Outstanding</dt><dd>{formatCurrency(finance?.outstanding_cents)}</dd></div>
          </dl>
          <Link href="/admin/finance">View finance & tax <ArrowUpRight size={15} /></Link>
        </article>
      </section>

      <section className="admin-card table-card">
        <div className="card-heading"><div><p>Operations</p><h2>Jobs at a glance</h2></div><Link href="/admin/jobs">View all</Link></div>
        {data.recentJobs.length ? (
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Job</th><th>Due</th><th>Hours</th><th>Assets</th><th>Open</th><th>Value</th></tr></thead><tbody>
            {data.recentJobs.map((job: Record<string, unknown>) => <tr key={job.id as string}><td><strong>{job.title as string}</strong><small>{(job.job_number as string) || "No job number"}</small></td><td>{formatDate(job.due_date as string)}</td><td>{Number(job.hours ?? 0).toFixed(2)}</td><td>{String(job.created_assets ?? 0)}</td><td><span className="count-pill">{String(job.open_tasks ?? 0)}</span></td><td><strong>{formatCurrency(Number(job.value_cents ?? 0))}</strong></td></tr>)}
          </tbody></table></div>
        ) : <EmptyState title="No jobs yet" description="Create a job or import the existing CSV records to start the operational view." />}
      </section>
    </>
  );
}
