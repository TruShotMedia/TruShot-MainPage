import { describe, expect, it } from "vitest";
import { allocateInvoiceCents, estimateSoleTraderTax, incomeTax2026 } from "./finance";

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
