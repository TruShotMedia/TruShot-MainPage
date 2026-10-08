import { describe, expect, it } from "vitest";
import {
  pairInvoicePaymentDates,
  paymentDateToTimestamp,
} from "@/lib/invoice-payment-dates";

describe("invoice payment dates", () => {
  it("stores a selected Brisbane date without UTC date drift", () => {
    expect(paymentDateToTimestamp("2026-10-08")).toBe("2026-10-08T12:00:00+10:00");
  });

  it("pairs each submitted date with its payment id", () => {
    expect(pairInvoicePaymentDates(["one", "two"], ["2026-09-01", "2026-10-08"]))
      .toEqual([
        { paymentId: "one", paidAt: "2026-09-01T12:00:00+10:00" },
        { paymentId: "two", paidAt: "2026-10-08T12:00:00+10:00" },
      ]);
  });

  it("rejects mismatched or duplicate payment submissions", () => {
    expect(() => pairInvoicePaymentDates(["one"], [])).toThrow(/matched/);
    expect(() => pairInvoicePaymentDates(["one", "one"], ["2026-09-01", "2026-10-08"]))
      .toThrow(/more than once/);
  });
});
