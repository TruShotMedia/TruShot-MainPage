import { describe, expect, it } from "vitest";
import { autopacificMfaDestination, autopacificMfaPath, safeAutopacificPath } from "./autopacific-access";
import { jobDeliverablesInputSchema } from "./job-deliverables";

describe("AutoPacific login destinations", () => {
  it("preserves the selected app and tab", () => {
    expect(safeAutopacificPath("/autopacific/mobile?view=calendar")).toBe("/autopacific/mobile?view=calendar");
  });
  it("cannot redirect to other applications or an external host", () => {
    for (const path of ["/admin/finance", "//evil.test", "https://evil.test", "/autopacific/login", "/autopacific/../admin", "/autopacific\\evil", "/ingreign", undefined]) expect(safeAutopacificPath(path)).toBe("/autopacific");
  });
  it("supports setup without open redirects or verification loops", () => {
    expect(safeAutopacificPath("/autopacific/security?next=%2Fmarketing")).toBe("/autopacific/security?next=%2Fmarketing");
    expect(autopacificMfaDestination("/autopacific/security?next=/marketing")).toBe("/marketing");
    expect(autopacificMfaDestination("/autopacific/security?next=/autopacific/security")).toBe("/autopacific");
    expect(autopacificMfaPath("/marketing?view=calendar")).toBe("/autopacific/security?next=%2Fmarketing%3Fview%3Dcalendar");
    expect(autopacificMfaDestination("https://evil.test")).toBe("/autopacific");
  });
});

describe("job deliverables", () => {
  it("converts pasted bullets and numbering into a clean list", () => {
    expect(jobDeliverablesInputSchema.parse(" • Launch video\r\n\n- 5 photographs\n2. Vertical edit\n* Captions")).toEqual(["Launch video", "5 photographs", "Vertical edit", "Captions"]);
    expect(jobDeliverablesInputSchema.parse("")).toEqual([]);
  });
  it("limits both the number and size of deliverables", () => {
    expect(jobDeliverablesInputSchema.safeParse(Array(31).fill("Clip").join("\n")).success).toBe(false);
    expect(jobDeliverablesInputSchema.safeParse("x".repeat(301)).success).toBe(false);
  });
});
