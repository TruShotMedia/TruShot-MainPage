import { describe, expect, it } from "vitest";
import { buildAnomalyAlerts, buildAttributionRows, percentChange } from "@/lib/revenue-analytics";

describe("revenue analytics", () => {
  it("handles empty comparison baselines", () => {
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(4, 0)).toBeNull();
  });

  it("connects an attributed enquiry to invoice and payment revenue", () => {
    const rows = buildAttributionRows({
      dimension: "source",
      enquiries: [{ id: "e1", analytics_anonymous_id: "a1", converted_client_id: "c1", package_id: null, status: "approved", attribution: { utm: { source: "facebook" } } }],
      sessions: [],
      invoices: [{ id: "i1", client_id: "c1", status: "paid", total_cents: 120000 }],
      payments: [{ invoice_id: "i1", amount_cents: 120000 }],
      packages: [],
      marketingSpend: [{ source: "Facebook", campaign: null, amount_cents: 30000 }],
    });
    expect(rows[0]).toMatchObject({ label: "facebook", leads: 1, approved: 1, paidCents: 120000, costPerLeadCents: 30000 });
  });

  it("flags meaningful conversion drops", () => {
    expect(buildAnomalyAlerts({ current: { visitors: 100, ctaRate: 5 }, previous: { visitors: 100, ctaRate: 10 }, sensitivityPercent: 30, minimumVisitors: 10 })[0]).toMatchObject({ key: "ctaRate", direction: "down", severity: "attention" });
  });
});
