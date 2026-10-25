import { describe, expect, it } from "vitest";
import { findAirlineCodeByName, findClosestAirline } from "@/lib/airlines";

describe("airline matching", () => {
  it("normalises legacy airline abbreviations to their dropdown carrier", () => {
    expect(findAirlineCodeByName("VIRGIN AU ")).toBe("VA");
    expect(findAirlineCodeByName("Qantas Airways")).toBe("QF");
    expect(findAirlineCodeByName(" Virgin Australia ")).toBe("VA");
  });

  it("matches familiar shortened carrier names without guessing unrelated airlines", () => {
    expect(findClosestAirline("Jetstar")?.code).toBe("JQ");
    expect(findClosestAirline("Unrelated private charter")).toBeNull();
  });
});
