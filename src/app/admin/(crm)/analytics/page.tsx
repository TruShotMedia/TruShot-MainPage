import { Activity, Clock3, MousePointerClick, UsersRound } from "lucide-react";
import { AdminChart } from "@/components/admin/chart";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { getAnalyticsData } from "@/lib/data/admin";

export default async function AnalyticsPage() {
  const data = await getAnalyticsData();
  if (!data) return null;
  const eventCounts = new Map<string, number>();
  data.events.forEach((event: Record<string, unknown>) => eventCounts.set(String(event.event_name), (eventCounts.get(String(event.event_name)) ?? 0) + 1));
  const daily = new Map<string, number>();
  data.events.filter((event: Record<string, unknown>) => event.event_name === "page_view").forEach((event: Record<string, unknown>) => { const key = String(event.occurred_at).slice(0, 10); daily.set(key, (daily.get(key) ?? 0) + 1); });
  const topClicks = new Map<string, number>();
  data.events.filter((event: Record<string, unknown>) => event.event_name === "cta_click" && event.analytics_key).forEach((event: Record<string, unknown>) => topClicks.set(String(event.analytics_key), (topClicks.get(String(event.analytics_key)) ?? 0) + 1));
  const sortedClicks = [...topClicks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const visitorIds = new Set(data.events.map((event: Record<string, unknown>) => String(event.anonymous_id)));
  const heartbeatSeconds = new Map<string, number>();
  data.events.filter((event: Record<string, unknown>) => event.event_name === "heartbeat").forEach((event: Record<string, unknown>) => {
    const properties = event.properties as { activeSeconds?: number } | null;
    const key = String(event.anonymous_id);
    heartbeatSeconds.set(key, Math.max(heartbeatSeconds.get(key) ?? 0, Number(properties?.activeSeconds ?? 0)));
  });
  const visitorCount = data.sessions.length || visitorIds.size;
  const averageSeconds = data.sessions.length
    ? data.sessions.reduce((sum: number, session: Record<string, unknown>) => sum + Number(session.active_seconds), 0) / data.sessions.length
    : heartbeatSeconds.size ? [...heartbeatSeconds.values()].reduce((sum, value) => sum + value, 0) / heartbeatSeconds.size : 0;
  const chartOption = { animationDuration: 650, grid: { left: 5, right: 12, top: 20, bottom: 7, containLabel: true }, tooltip: { trigger: "axis" }, xAxis: { type: "category", boundaryGap: false, data: [...daily.keys()].map((day) => day.slice(5)), axisLine: { show: false }, axisTick: { show: false } }, yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#eceae3" } } }, series: [{ type: "line", smooth: true, data: [...daily.values()], lineStyle: { color: "#1f5e41", width: 3 }, symbolSize: 8, itemStyle: { color: "#1f5e41" }, areaStyle: { color: "rgba(31,94,65,.13)" } }] };
  return (
    <>
      <PageHeader eyebrow="First-party insight" title="Website analytics" description="See what earns attention, what gets clicked and how pricing interest becomes a client request — without invasive tracking." />
      <section className="metric-grid analytics-metrics"><MetricCard label="Visitors" value={String(visitorCount)} note="Anonymous sessions · 30 days" icon={UsersRound} /><MetricCard label="Page views" value={String(eventCounts.get("page_view") ?? 0)} note="Public website" icon={Activity} tone="ink" /><MetricCard label="CTA clicks" value={String(eventCounts.get("cta_click") ?? 0)} note="Tracked interaction keys" icon={MousePointerClick} tone="gold" /><MetricCard label="Active time" value={`${Math.round(averageSeconds)}s`} note="Average per session" icon={Clock3} tone="lilac" /></section>
      <section className="dashboard-grid analytics-grid"><article className="admin-card chart-card"><div className="card-heading"><div><p>Attention</p><h2>Daily page views</h2></div><span>30 days</span></div><AdminChart option={chartOption} /></article><article className="admin-card click-rank"><p className="card-label">Interaction ranking</p><h2>Most-clicked elements</h2>{sortedClicks.length ? <ol>{sortedClicks.map(([key, count]) => <li key={key}><span>{key}</span><div><i style={{ width: `${count / sortedClicks[0][1] * 100}%` }} /></div><b>{count}</b></li>)}</ol> : <p className="muted-copy">Clicks will appear after visitors use the live website.</p>}</article></section>
      <section className="admin-card funnel-card"><div className="card-heading"><div><p>Conversion path</p><h2>Visitor to request</h2></div></div><div className="funnel-row"><div><strong>{eventCounts.get("page_view") ?? 0}</strong><span>Page views</span></div><b>→</b><div><strong>{eventCounts.get("cta_click") ?? 0}</strong><span>CTA clicks</span></div><b>→</b><div><strong>{eventCounts.get("form_start") ?? 0}</strong><span>Form starts</span></div><b>→</b><div><strong>{eventCounts.get("enquiry_submit") ?? 0}</strong><span>Requests</span></div></div></section>
    </>
  );
}
