import { describe, expect, it } from "vitest";
import { safeAuthenticatedPath } from "./auth-redirect";

describe("safe authenticated redirects", () => {
  it("allows the protected tablet, AutoPacific and CRM routes", () => {
    expect(safeAuthenticatedPath("/tablet")).toBe("/tablet");
    expect(safeAuthenticatedPath("/autopacific")).toBe("/autopacific");
    expect(safeAuthenticatedPath("/autopacific/mobile")).toBe("/autopacific/mobile");
    expect(safeAuthenticatedPath("/admin/calendar")).toBe("/admin/calendar");
  });

  it("rejects external, login-loop and public destinations", () => {
    expect(safeAuthenticatedPath("//example.com/steal")).toBe("/admin/overview");
    expect(safeAuthenticatedPath("/admin/login?next=/tablet")).toBe("/admin/overview");
    expect(safeAuthenticatedPath("/portfolio")).toBe("/admin/overview");
  });
});
