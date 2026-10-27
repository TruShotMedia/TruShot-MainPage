import { describe, expect, it } from "vitest";
import { autopacificApplicationNames, autopacificBrowserIcons, autopacificTabTitle } from "./autopacific-browser-branding";

describe("AutoPacific browser branding", () => {
  it.each([
    ["production", "jobs", undefined, "Jobs | AutoPacific Production"],
    ["marketing", "pipeline", undefined, "Tasks | AutoPacific Marketing"],
    ["marketing", "calendar", undefined, "Calendar | AutoPacific Marketing"],
    ["production", "today", undefined, "Today | AutoPacific Production"],
    ["marketing", "jobs", "planning", "Planning | AutoPacific Marketing"],
    ["production", "jobs", "completed", "Completed jobs | AutoPacific Production"],
  ] as const)("labels %s %s clearly", (mode, view, jobView, expected) => {
    expect(autopacificTabTitle(mode, view, jobView)).toBe(expected);
  });

  it("gives each workspace its own versioned SVG and small PNG fallback", () => {
    for (const mode of ["production", "marketing"] as const) {
      const icons = autopacificBrowserIcons(mode);
      expect(icons.icon).toEqual([
        { url: `/autopacific/icons/32?surface=${mode}&v=1`, sizes: "32x32", type: "image/png" },
        { url: `/brand/autopacific-${mode}-favicon.svg?v=1`, sizes: "any", type: "image/svg+xml" },
      ]);
      expect(icons.apple[0].url).toBe("/autopacific/icons/180");
      expect(autopacificApplicationNames[mode]).not.toContain("TruShot");
    }
  });
});
