import { describe, expect, it } from "vitest";
import { workspaceInitialView, workspaceViews } from "./workspace-mode";
import { datedJobDeliverablesInputSchema } from "./job-deliverables";

describe("marketing capabilities", () => {
  it("exposes jobs, review-only tasks and calendar; planning stays inside Jobs", () => {
    expect(workspaceViews("marketing", true)).toEqual(["jobs", "pipeline", "calendar"]);
    expect(workspaceInitialView("pipeline", "marketing", true)).toBe("pipeline");
    expect(workspaceInitialView("today", "marketing", true)).toBe("jobs");
    expect(workspaceInitialView("planning", "production", true)).toBe("pipeline");
  });
});
describe("dated deliverables", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  it("accepts both optional and explicit dates without losing IDs", () => {
    expect(datedJobDeliverablesInputSchema.parse(JSON.stringify([{ id, name: " Film launch ", date: "" }]))).toEqual([{ id, name: "Film launch", date: null }]);
    expect(datedJobDeliverablesInputSchema.parse(JSON.stringify([{ id, name: "Launch", date: "2026-11-13" }]))[0].date).toBe("2026-11-13");
  });
  it("rejects invalid dates, blank names, duplicated IDs and malformed JSON", () => {
    for (const value of ["no-json", JSON.stringify([{ id, name: "", date: null }]), JSON.stringify([{ id, name: "Launch", date: "2026-02-30" }]), JSON.stringify([{ id, name: "A", date: null }, { id, name: "B", date: null }])]) expect(datedJobDeliverablesInputSchema.safeParse(value).success).toBe(false);
  });
});
