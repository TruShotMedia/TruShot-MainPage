type TimedRecord = { created_at?: string; occurred_at?: string; started_at?: string };

export type AnalyticsPeriod = { from: string; to: string };

export function isInAnalyticsPeriod(record: TimedRecord, period: AnalyticsPeriod) {
  const value = record.created_at ?? record.occurred_at ?? record.started_at;
  return Boolean(value && value >= period.from && value <= period.to);
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous * 100;
}

export type AnomalyAlert = {
  key: string;
  label: string;
  current: number;
  previous: number;
  changePercent: number;
  direction: "up" | "down";
  severity: "positive" | "attention" | "neutral";
};

export function buildAnomalyAlerts({
  current,
  previous,
  sensitivityPercent,
  minimumVisitors,
}: {
  current: Partial<Record<"visitors" | "ctaRate" | "enquiryRate" | "paidRevenue", number>>;
  previous: Partial<Record<"visitors" | "ctaRate" | "enquiryRate" | "paidRevenue", number>>;
  sensitivityPercent: number;
  minimumVisitors: number;
}) {
  if (Math.max(current.visitors ?? 0, previous.visitors ?? 0) < minimumVisitors) return [];
  const definitions = [
    ["visitors", "Visitors", false],
    ["ctaRate", "CTA conversion", true],
    ["enquiryRate", "Enquiry conversion", true],
    ["paidRevenue", "Paid revenue", true],
  ] as const;
  return definitions.flatMap(([key, label, higherIsBetter]) => {
    const change = percentChange(current[key] ?? 0, previous[key] ?? 0);
    if (change === null || Math.abs(change) < sensitivityPercent) return [];
    const direction = change > 0 ? "up" : "down";
    return [{
      key,
      label,
      current: current[key] ?? 0,
      previous: previous[key] ?? 0,
      changePercent: change,
      direction,
      severity: higherIsBetter ? (change > 0 ? "positive" : "attention") : "neutral",
    } satisfies AnomalyAlert];
  });
}

type AttributionEnquiry = {
  id: string;
  analytics_anonymous_id: string | null;
  converted_client_id: string | null;
  package_id: string | null;
  status: string;
  attribution: Record<string, unknown> | null;
};

type AttributionSession = {
  anonymous_id: string;
  referrer_domain: string | null;
  device_class: string | null;
  utm: Record<string, unknown> | null;
};

type AttributionInvoice = { id: string; client_id: string | null; status: string; total_cents: number };
type AttributionPayment = { invoice_id: string; amount_cents: number };
type MarketingSpend = { source: string; campaign: string | null; amount_cents: number };

export type AttributionRow = {
  label: string;
  leads: number;
  approved: number;
  invoicedCents: number;
  paidCents: number;
  spendCents: number;
  costPerLeadCents: number | null;
};

function cleanDimension(value: unknown, fallback: string) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return cleaned || fallback;
}

export function buildAttributionRows({
  dimension,
  enquiries,
  sessions,
  invoices,
  payments,
  packages,
  marketingSpend,
}: {
  dimension: "source" | "campaign" | "device" | "package";
  enquiries: AttributionEnquiry[];
  sessions: AttributionSession[];
  invoices: AttributionInvoice[];
  payments: AttributionPayment[];
  packages: { id: string; title: string }[];
  marketingSpend: MarketingSpend[];
}) {
  const sessionByAnonymous = new Map(sessions.map((session) => [session.anonymous_id, session]));
  const packageById = new Map(packages.map((item) => [item.id, item.title]));
  const invoicesByClient = new Map<string, AttributionInvoice[]>();
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  invoices.filter((invoice) => invoice.client_id && invoice.status !== "void" && invoice.status !== "draft").forEach((invoice) => {
    invoicesByClient.set(invoice.client_id!, [...(invoicesByClient.get(invoice.client_id!) ?? []), invoice]);
  });
  const paidByClient = new Map<string, number>();
  payments.forEach((payment) => {
    const invoice = invoiceById.get(payment.invoice_id);
    if (invoice?.client_id && invoice.status !== "void" && invoice.status !== "draft") paidByClient.set(invoice.client_id, (paidByClient.get(invoice.client_id) ?? 0) + Number(payment.amount_cents));
  });

  const rows = new Map<string, AttributionRow>();
  const rowKey = (label: string) => label.toLocaleLowerCase("en-AU");
  const getLabel = (enquiry: AttributionEnquiry) => {
    const attribution = enquiry.attribution ?? {};
    const session = enquiry.analytics_anonymous_id ? sessionByAnonymous.get(enquiry.analytics_anonymous_id) : undefined;
    const utm = (typeof attribution.utm === "object" && attribution.utm ? attribution.utm : session?.utm ?? {}) as Record<string, unknown>;
    if (dimension === "campaign") return cleanDimension(utm.campaign ?? attribution.utm_campaign, "Unattributed");
    if (dimension === "device") return cleanDimension(attribution.device_class ?? session?.device_class, "Unknown device");
    if (dimension === "package") return enquiry.package_id ? packageById.get(enquiry.package_id) ?? "Unknown package" : "No package selected";
    return cleanDimension(utm.source ?? attribution.utm_source ?? attribution.referrer_domain ?? session?.referrer_domain, "Direct");
  };

  for (const enquiry of enquiries) {
    const label = getLabel(enquiry);
    const key = rowKey(label);
    const row = rows.get(key) ?? { label, leads: 0, approved: 0, invoicedCents: 0, paidCents: 0, spendCents: 0, costPerLeadCents: null };
    row.leads += 1;
    if (enquiry.converted_client_id || enquiry.status === "approved") row.approved += 1;
    if (enquiry.converted_client_id) {
      row.invoicedCents += (invoicesByClient.get(enquiry.converted_client_id) ?? []).reduce((sum, invoice) => sum + Number(invoice.total_cents), 0);
      row.paidCents += paidByClient.get(enquiry.converted_client_id) ?? 0;
    }
    rows.set(key, row);
  }

  if (dimension === "source" || dimension === "campaign") {
    for (const spend of marketingSpend) {
      const label = cleanDimension(dimension === "source" ? spend.source : spend.campaign, dimension === "source" ? "Direct" : "Unattributed");
      const key = rowKey(label);
      const row = rows.get(key) ?? { label, leads: 0, approved: 0, invoicedCents: 0, paidCents: 0, spendCents: 0, costPerLeadCents: null };
      row.spendCents += Number(spend.amount_cents);
      rows.set(key, row);
    }
  }

  return [...rows.values()]
    .map((row) => ({ ...row, costPerLeadCents: row.leads > 0 && row.spendCents > 0 ? Math.round(row.spendCents / row.leads) : null }))
    .sort((a, b) => b.paidCents - a.paidCents || b.leads - a.leads || a.label.localeCompare(b.label));
}
