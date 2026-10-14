import { describe, expect, it } from "vitest";
import { parseTabletView } from "./tablet-view";

describe("parseTabletView", () => {
  it("restores jobs and calendar while defaulting every other value to tasks", () => {
    expect(parseTabletView("jobs")).toBe("jobs");
    expect(parseTabletView("calendar")).toBe("calendar");
    expect(parseTabletView("pipeline")).toBe("pipeline");
    expect(parseTabletView(undefined)).toBe("pipeline");
    expect(parseTabletView("unknown")).toBe("pipeline");
  });
});
