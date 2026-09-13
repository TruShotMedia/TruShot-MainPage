import { describe, expect, it } from "vitest";
import { parseReceiptText } from "@/lib/receipt-ocr";

describe("parseReceiptText", () => {
  it("extracts common Australian receipt fields", () => {
    expect(parseReceiptText(`Camera House Brisbane\nABN 12 345 678 901\n13/09/2026\nSubtotal $99.00\nGST $9.90\nTOTAL $108.90`)).toMatchObject({
      vendor: "Camera House Brisbane",
      date: "2026-09-13",
      amountDollars: 108.9,
      gstDollars: 9.9,
      confidence: "high",
    });
  });

  it("derives the included GST when a receipt labels the total as GST inclusive", () => {
    expect(parseReceiptText("Camera Hire Brisbane\n12/09/2026\nTOTAL $110.00\nGST inclusive")).toMatchObject({
      amountDollars: 110,
      gstDollars: 10,
    });
  });

  it("prefers amount due over subtotal", () => {
    expect(parseReceiptText(`Cloud Software Pty Ltd\n2026-08-31\nSUBTOTAL AUD 45.00\nGST AUD 4.50\nAMOUNT DUE AUD 49.50`).amountDollars).toBe(49.5);
  });
});
