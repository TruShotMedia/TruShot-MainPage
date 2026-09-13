import { describe, expect, it } from "vitest";
import { allocateInvoiceCents, buildBasEstimate, buildReceivablesAgeing, estimateSoleTraderTax, incomeTax2026 } from "./finance";

describe("job value allocation", () => {
  it("allocates invoice cents by each job's share of total hours", () => {
    const allocation = allocateInvoiceCents(100_000, [
      { id: "a", hours: 4 },
      { id: "b", hours: 3 },
      { id: "c", hours: 2 },
      { id: "d", hours: 1 },
    ]);
    expect(allocation.map((item) => item.allocatedCents)).toEqual([40_000, 30_000, 20_000, 10_000]);
    expect(allocation.reduce((sum, item) => sum + item.allocatedCents, 0)).toBe(100_000);
  });

  it("uses deterministic largest-remainder rounding", () => {
    const allocation = allocateInvoiceCents(100, [
      { id: "a", hours: 1 },
      { id: "b", hours: 1 },
      { id: "c", hours: 1 },
    ]);
    expect(allocation).toEqual([
      { id: "a", hours: 1, allocatedCents: 34 },
      { id: "b", hours: 1, allocatedCents: 33 },
      { id: "c", hours: 1, allocatedCents: 33 },
    ]);
  });

  it("does not invent value when every linked job has zero hours", () => {
    expect(allocateInvoiceCents(50_000, [{ id: "a", hours: 0 }])[0].allocatedCents).toBe(0);
  });
});

describe("2026-27 tax planning", () => {
  it("uses the legislated 15% second bracket", () => {
    expect(incomeTax2026(45_000)).toBe(4_020);
  });

  it("returns an estimate with levy and capped small-business offset", () => {
    const result = estimateSoleTraderTax(100_000);
    expect(result.smallBusinessOffset).toBe(1_000);
    expect(result.medicareLevy).toBe(2_000);
    expect(result.estimatedTax).toBeGreaterThan(20_000);
  });
});

describe("finance reporting", () => {
  const invoices = [{ id: "i1", client_id: "c1", status: "sent", issue_date: "2026-07-01", due_date: "2026-07-31", total_cents: 110000, gst_cents: 10000 }];

  it("ages only the unpaid invoice balance", () => {
    expect(buildReceivablesAgeing(invoices, [{ invoice_id: "i1", amount_cents: 10000, paid_at: "2026-07-10" }], new Date("2026-09-10T00:00:00Z"))).toMatchObject({ days31to60: 100000 });
  });

  it("uses payments for cash-basis BAS estimates", () => {
    const result = buildBasEstimate({
      invoices,
      payments: [{ invoice_id: "i1", amount_cents: 55000, paid_at: "2026-08-15" }],
      expenses: [{ amount_cents: 11000, gst_credit_cents: 1000, deductible_percent: 100, incurred_on: "2026-08-20", category: { tax_category: "operating_expense" } }],
      from: "2026-07-01",
      to: "2026-09-30",
      basis: "cash",
      isGstRegistered: true,
    });
    expect(result).toMatchObject({ totalSalesCents: 55000, gstOnSalesCents: 5000, gstCreditsCents: 1000, netGstCents: 4000 });
  });

  it("does not treat draft invoices as issued revenue or receivables", () => {
    const draft = [{ ...invoices[0], id: "draft", status: "draft" }];
    expect(buildReceivablesAgeing(draft, [], new Date("2026-09-10T00:00:00Z"))).toEqual({
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
    });
    expect(buildBasEstimate({ invoices: draft, payments: [], expenses: [], from: "2026-07-01", to: "2026-09-30", basis: "accrual", isGstRegistered: true }).totalSalesCents).toBe(0);
  });
});
