import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Clock3, DollarSign, Eye, MousePointerClick, Plus, ReceiptText, Save, Settings2, UserCheck, UsersRound, type LucideIcon } from "lucide-react";
import { createAnalyticsSavedView, createMarketingSpend, deleteAnalyticsSavedView, updateAnalyticsAlertSettings } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { AdminChart } from "@/components/admin/chart";
import { AttributionExplorer } from "@/components/admin/attribution-explorer";
import { PageHeader } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/admin/submit-button";
import { getAnalyticsData } from "@/lib/data/admin";
import { buildAnomalyAlerts, buildAttributionRows, isInAnalyticsPeriod, percentChange, type AnalyticsPeriod } from "@/lib/revenue-analytics";
import { formatCurrency, todayDateInput } from "@/lib/format";

type Event = { anonymous_id: string; event_name: string; analytics_key: string | null; properties: Record<string, unknown>; occurred_at: string };
type Enquiry = { id: string; analytics_anonymous_id: string | null; converted_client_id: string | null; package_id: string | null; status: string; attribution: Record<string, unknown>; created_at: string };
type Invoice = { id: string; client_id: string | null; status: string; total_cents: number; issue_date: string };
type Payment = { invoice_id: string; amount_cents: number; paid_at: string };

function summarise(events: Event[], enquiries: Enquiry[], invoices: Invoice[], payments: Payment[], period: AnalyticsPeriod) {
  const periodEvents = events.filter((event) => isInAnalyticsPeriod(event, period));
  const periodEnquiries = enquiries.filter((enquiry) => isInAnalyticsPeriod(enquiry, period));
  const visitorIds = new Set(periodEvents.map((event) => event.anonymous_id));
  const ctaIds = new Set(periodEvents.filter((event) => event.event_name === "cta_click").map((event) => event.anonymous_id));
  const formIds = new Set(periodEvents.filter((event) => event.event_name === "form_start").map((event) => event.anonymous_id));
  const approved = periodEnquiries.filter((enquiry) => enquiry.converted_client_id || enquiry.status === "approved");
  const clientIds = new Set(approved.flatMap((enquiry) => enquiry.converted_client_id ? [enquiry.converted_client_id] : []));
  const cohortInvoices = invoices.filter((invoice) => invoice.client_id && clientIds.has(invoice.client_id) && invoice.status !== "void" && invoice.status !== "draft");
  const cohortInvoiceIds = new Set(cohortInvoices.map((invoice) => invoice.id));
  const cohortPayments = payments.filter((payment) => cohortInvoiceIds.has(payment.invoice_id));
  const visitors = visitorIds.size;
  return {
    visitors,
    pageViews: periodEvents.filter((event) => event.event_name === "page_view").length,
    ctaVisitors: ctaIds.size,
    formVisitors: formIds.size,
    enquiries: periodEnquiries.length,
    approved: approved.length,
    invoicedClients: new Set(cohortInvoices.flatMap((invoice) => invoice.client_id ? [invoice.client_id] : [])).size,
    paidClients: new Set(cohortPayments.flatMap((payment) => {
      const clientId = invoices.find((invoice) => invoice.id === payment.invoice_id)?.client_id;
      return clientId ? [clientId] : [];
    })).size,
    invoicedRevenue: cohortInvoices.reduce((sum, invoice) => sum + Number(invoice.total_cents), 0),
    paidRevenue: cohortPayments.reduce((sum, payment) => sum + Number(payment.amount_cents), 0),
    ctaRate: visitors ? ctaIds.size / visitors * 100 : 0,
    enquiryRate: visitors ? periodEnquiries.length / visitors * 100 : 0,
    events: periodEvents,
    periodEnquiries,
  };
}

function Trend({ current, previous, currency = false }: { current: number; previous: number; currency?: boolean }) {
  const change = percentChange(current, previous);
  if (change === null) return <span className="metric-trend is-new">New in this period</span>;
  const up = change >= 0;
  return <span className={`metric-trend ${up ? "is-up" : "is-down"}`}>{up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(change).toFixed(0)}% vs comparison{currency ? " revenue" : ""}</span>;
}

function RevenueMetric({ label, value, note, icon: Icon, trend }: { label: string; value: string; note: string; icon: LucideIcon; trend: ReactNode }) {
  return <article className="revenue-metric"><span><Icon size={18} /></span><p>{label}</p><strong>{value}</strong><small>{note}</small>{trend}</article>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string; compare?: string }> }) {
  const params = await searchParams;
  const rangeDays = Math.min(730, Math.max(1, Number(params.days) || 30));
  const comparisonMode = params.compare === "previous_year" ? "previous_year" : "previous_period";
  const data = await getAnalyticsData({ rangeDays, comparisonMode });
  if (!data) return null;
  const events = data.events as Event[];
  const enquiries = data.enquiries as Enquiry[];
  const invoices = data.invoices as Invoice[];
  const payments = data.payments as Payment[];
  const current = summarise(events, enquiries, invoices, payments, data.currentPeriod);
  const previous = summarise(events, enquiries, invoices, payments, data.previousPeriod);
  const currentSpend = data.marketingSpend.filter((spend) => spend.spend_on >= data.currentPeriod.from.slice(0, 10));
  const attributionRows = {
    source: buildAttributionRows({ dimension: "source", enquiries: current.periodEnquiries, sessions: data.sessions, invoices, payments, packages: data.packages, marketingSpend: currentSpend }),
    campaign: buildAttributionRows({ dimension: "campaign", enquiries: current.periodEnquiries, sessions: data.sessions, invoices, payments, packages: data.packages, marketingSpend: currentSpend }),
    device: buildAttributionRows({ dimension: "device", enquiries: current.periodEnquiries, sessions: data.sessions, invoices, payments, packages: data.packages, marketingSpend: currentSpend }),
    package: buildAttributionRows({ dimension: "package", enquiries: current.periodEnquiries, sessions: data.sessions, invoices, payments, packages: data.packages, marketingSpend: currentSpend }),
  };
  const alerts = data.alertSettings.enabled ? buildAnomalyAlerts({ current, previous, sensitivityPercent: data.alertSettings.sensitivity_percent, minimumVisitors: data.alertSettings.minimum_visitors }) : [];
  const daily = new Map<string, { views: number; enquiries: number }>();
  current.events.filter((event) => event.event_name === "page_view").forEach((event) => { const key = event.occurred_at.slice(0, 10); const bucket = daily.get(key) ?? { views: 0, enquiries: 0 }; bucket.views += 1; daily.set(key, bucket); });
  current.periodEnquiries.forEach((enquiry) => { const key = enquiry.created_at.slice(0, 10); const bucket = daily.get(key) ?? { views: 0, enquiries: 0 }; bucket.enquiries += 1; daily.set(key, bucket); });
  const sortedDays = [...daily.keys()].sort();
  const chartOption = { animationDuration: 650, grid: { left: 5, right: 12, top: 38, bottom: 7, containLabel: true }, legend: { top: 0, right: 0, textStyle: { fontSize: 10, color: "#7b8078" } }, tooltip: { trigger: "axis" }, xAxis: { type: "category", boundaryGap: false, data: sortedDays.map((day) => day.slice(5)), axisLine: { show: false }, axisTick: { show: false } }, yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#eceae3" } } }, series: [{ name: "Page views", type: "line", smooth: true, data: sortedDays.map((day) => daily.get(day)!.views), lineStyle: { color: "#1f5e41", width: 3 }, symbolSize: 7, itemStyle: { color: "#1f5e41" }, areaStyle: { color: "rgba(31,94,65,.11)" } }, { name: "Enquiries", type: "line", smooth: true, data: sortedDays.map((day) => daily.get(day)!.enquiries), lineStyle: { color: "#b06b45", width: 2 }, symbolSize: 6, itemStyle: { color: "#b06b45" } }] };
  const topClicks = new Map<string, number>();
  current.events.filter((event) => event.event_name === "cta_click" && event.analytics_key).forEach((event) => topClicks.set(event.analytics_key!, (topClicks.get(event.analytics_key!) ?? 0) + 1));
  const sortedClicks = [...topClicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const currentSessions = data.sessions.filter((session) => session.last_seen_at >= data.currentPeriod.from && session.started_at <= data.currentPeriod.to);
  const averageSeconds = currentSessions.length ? currentSessions.reduce((sum, session) => sum + Number(session.active_seconds), 0) / currentSessions.length : 0;
  const dateLabel = `${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(data.currentPeriod.from))} – ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(data.currentPeriod.to))}`;

  return <>
    <PageHeader eyebrow="Revenue intelligence" title="Revenue analytics" description="Follow attention all the way from the first click to an approved client, issued invoice and received payment." actions={<ActionPopover action={createMarketingSpend} summary={<><Plus size={16} /> Marketing spend</>} title="Record marketing spend" formClassName="quick-form wide"><label>Date<input type="date" name="spend_on" defaultValue={todayDateInput()} required /></label><label>Source<input name="source" placeholder="Meta, Google, referral…" required /></label><label>Campaign<input name="campaign" placeholder="Optional UTM campaign" /></label><label>Amount AUD<input type="number" name="amount_dollars" min="0" step="0.01" required /></label><label className="form-span">Notes<input name="notes" /></label><SubmitButton pendingLabel="Saving…">Save spend</SubmitButton></ActionPopover>} />
    <section className="admin-card analytics-control-bar">
      <form method="get"><label>Period<select name="days" defaultValue={String(rangeDays)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></label><label>Compare with<select name="compare" defaultValue={comparisonMode}><option value="previous_period">Previous period</option><option value="previous_year">Same time last year</option></select></label><button className="admin-primary-button">Apply</button><span>{dateLabel}</span></form>
      <div className="saved-view-strip">{data.savedViews.map((view) => <span key={view.id}><Link className={view.range_days === rangeDays && view.comparison_mode === comparisonMode ? "is-active" : ""} href={`/admin/analytics?days=${view.range_days}&compare=${view.comparison_mode}`}>{view.name}</Link>{!view.is_default ? <form action={deleteAnalyticsSavedView}><input type="hidden" name="id" value={view.id} /><button aria-label={`Delete ${view.name}`}>×</button></form> : null}</span>)}<ActionPopover action={createAnalyticsSavedView} summary={<><Save size={13} /> Save view</>} title="Save this comparison" summaryClassName="saved-view-add" formClassName="quick-form"><label>Name<input name="name" required /></label><input type="hidden" name="range_days" value={rangeDays} /><input type="hidden" name="comparison_mode" value={comparisonMode} /><label className="checkbox-label"><input type="checkbox" name="is_default" /> Make default</label><SubmitButton pendingLabel="Saving…">Save comparison</SubmitButton></ActionPopover></div>
    </section>
    <section className="revenue-metric-grid"><RevenueMetric label="Visitors" value={String(current.visitors)} note={`${current.pageViews} page views`} icon={UsersRound} trend={<Trend current={current.visitors} previous={previous.visitors} />} /><RevenueMetric label="CTA conversion" value={`${current.ctaRate.toFixed(1)}%`} note={`${current.ctaVisitors} visitors clicked`} icon={MousePointerClick} trend={<Trend current={current.ctaRate} previous={previous.ctaRate} />} /><RevenueMetric label="Lead conversion" value={`${current.enquiryRate.toFixed(1)}%`} note={`${current.enquiries} enquiries · ${current.approved} approved`} icon={UserCheck} trend={<Trend current={current.enquiryRate} previous={previous.enquiryRate} />} /><RevenueMetric label="Paid revenue" value={formatCurrency(current.paidRevenue)} note={`${formatCurrency(current.invoicedRevenue)} attributed invoiced`} icon={DollarSign} trend={<Trend current={current.paidRevenue} previous={previous.paidRevenue} currency />} /></section>
    <section className="admin-card full-funnel"><div className="card-heading"><div><p>Complete customer journey</p><h2>Attention to cash</h2></div><span>Period lead cohort</span></div><div className="full-funnel-row">{([
      { value: current.visitors, label: "Visitors", Icon: Eye },
      { value: current.ctaVisitors, label: "CTA clicks", Icon: MousePointerClick },
      { value: current.enquiries, label: "Enquiries", Icon: Activity },
      { value: current.approved, label: "Approved clients", Icon: UserCheck },
      { value: current.invoicedClients, label: "Invoiced clients", Icon: ReceiptText },
      { value: current.paidClients, label: "Paying clients", Icon: DollarSign },
    ] satisfies { value: number; label: string; Icon: LucideIcon }[]).map(({ value, label, Icon }, index) => <div key={label}><span><Icon size={16} /></span><strong>{value}</strong><small>{label}</small>{index < 5 ? <b>→</b> : null}</div>)}</div></section>
    <section className="analytics-insight-grid"><article className="admin-card chart-card"><div className="card-heading"><div><p>Attention & intent</p><h2>Website activity</h2></div><span>{rangeDays} days</span></div>{sortedDays.length ? <AdminChart option={chartOption} height={310} /> : <div className="expense-empty"><p>No activity in this period.</p><span>Choose a wider date range to see historical traffic.</span></div>}</article><article className="admin-card click-rank"><p className="card-label">Interaction ranking</p><h2>Most-clicked elements</h2>{sortedClicks.length ? <ol>{sortedClicks.map(([key, count]) => <li key={key}><span>{key}</span><div><i style={{ width: `${count / sortedClicks[0][1] * 100}%` }} /></div><b>{count}</b></li>)}</ol> : <p className="muted-copy">Clicks will appear after visitors use the live website.</p>}<div className="active-time"><Clock3 size={15} /><span>Average recorded active time</span><strong>{Math.round(averageSeconds)}s</strong></div></article></section>
    <AttributionExplorer rows={attributionRows} />
    <section className="admin-card anomaly-panel"><div className="anomaly-heading"><div><p className="card-label">Automatic monitoring</p><h2>Change alerts</h2><span>Material movement is calculated against the selected comparison whenever this page loads.</span></div><ActionPopover action={updateAnalyticsAlertSettings} summary={<><Settings2 size={14} /> Configure</>} title="Anomaly sensitivity" summaryClassName="admin-secondary-button" formClassName="quick-form"><label className="checkbox-label"><input type="checkbox" name="enabled" defaultChecked={data.alertSettings.enabled} /> Enable alerts</label><label>Change threshold %<input type="number" name="sensitivity_percent" min="10" max="200" defaultValue={data.alertSettings.sensitivity_percent} /></label><label>Minimum visitors<input type="number" name="minimum_visitors" min="1" max="10000" defaultValue={data.alertSettings.minimum_visitors} /></label><SubmitButton pendingLabel="Saving…">Save alert rules</SubmitButton></ActionPopover></div>{alerts.length ? <div className="anomaly-list">{alerts.map((alert) => <div key={alert.key} className={`is-${alert.severity}`}><span>{alert.severity === "attention" ? <AlertTriangle size={16} /> : alert.direction === "up" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</span><p><strong>{alert.label} moved {Math.abs(alert.changePercent).toFixed(0)}% {alert.direction}</strong><small>{alert.previous.toFixed(1)} → {alert.current.toFixed(1)} in the selected comparison</small></p></div>)}</div> : <div className="anomaly-clear"><Activity size={17} /><span>{data.alertSettings.enabled ? "No material anomalies crossed your current threshold." : "Automatic alerts are paused."}</span></div>}</section>
  </>;
}
