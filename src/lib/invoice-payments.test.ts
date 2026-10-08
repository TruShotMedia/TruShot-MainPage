import { describe, expect, it } from "vitest";
import { invoicePaymentTotals, invoiceStatusAfterEdit } from "@/lib/invoice-payments";

describe("invoice payments", () => {
  it("calculates paid and outstanding values from the payment ledger", () => {
    expect(invoicePaymentTotals(45_000, [{ amount_cents: 10_000 }, { amount_cents: 15_000 }])).toEqual({
      paidCents: 25_000,
      balanceCents: 20_000,
    });
  });

  it("treats paid status as a zero balance while the ledger is being reconciled", () => {
    expect(invoicePaymentTotals(45_000, [], "paid")).toEqual({
      paidCents: 45_000,
      balanceCents: 0,
    });
    expect(invoicePaymentTotals(45_000, [{ amount_cents: 10_000 }], "paid")).toEqual({
      paidCents: 45_000,
      balanceCents: 0,
    });
  });

  it("keeps paid as an explicit settlement instruction", () => {
    expect(invoiceStatusAfterEdit("paid", 45_000, 0)).toBe("paid");
  });

  it("derives part-paid and paid states from recorded cash", () => {
    expect(invoiceStatusAfterEdit("sent", 45_000, 15_000)).toBe("part_paid");
    expect(invoiceStatusAfterEdit("sent", 45_000, 45_000)).toBe("paid");
  });

  it("does not allow a part-paid label without a payment", () => {
    expect(invoiceStatusAfterEdit("part_paid", 45_000, 0)).toBe("sent");
  });

  it("preserves a deliberate void status", () => {
    expect(invoiceStatusAfterEdit("void", 45_000, 45_000)).toBe("void");
  });
});
