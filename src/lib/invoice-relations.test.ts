import { describe, expect, it } from "vitest";
import { getInvoiceRelationChanges } from "@/lib/invoice-relations";

describe("getInvoiceRelationChanges", () => {
  it("adds and removes only the changed invoice relationships", () => {
    expect(getInvoiceRelationChanges([
      { invoice_id: "invoice-a", is_locked: false },
      { invoice_id: "invoice-b", is_locked: false },
    ], ["invoice-b", "invoice-c"])).toEqual({
      additions: ["invoice-c"],
      removals: ["invoice-a"],
      lockedRemovals: [],
    });
  });

  it("protects a locked allocation from removal", () => {
    expect(getInvoiceRelationChanges([
      { invoice_id: "invoice-a", is_locked: true },
    ], [])).toEqual({
      additions: [],
      removals: [],
      lockedRemovals: ["invoice-a"],
    });
  });
});
