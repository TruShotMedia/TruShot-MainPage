import { describe, expect, it } from "vitest";
import { parseTabletView } from "./tablet-view";

describe("parseTabletView", () => {
  it("restores calendar and defaults every other value to pipeline", () => {
    expect(parseTabletView("calendar")).toBe("calendar");
    expect(parseTabletView("pipeline")).toBe("pipeline");
    expect(parseTabletView(undefined)).toBe("pipeline");
    expect(parseTabletView("unknown")).toBe("pipeline");
  });
});
