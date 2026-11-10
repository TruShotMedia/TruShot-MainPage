import { describe, expect, it } from "vitest";
import { clickUpJobProgress, clickUpJobTitle, undecoratedClickUpJobTitle } from "./job-progress";

const task = (key: string, source_deliverable_id: string | null = null) => ({ status: { key }, source_deliverable_id });
describe("ClickUp calendar job progress", () => {
  it("shows completed fraction and percentage before a long job title", () => {
    const progress = clickUpJobProgress([task("posted_done"), task("posted_done"), task("posted_done"), task("in_progress")]);
    expect(progress).toEqual({ completed: 3, total: 4, percent: 85 });
    expect(clickUpJobTitle("Launch capture", progress)).toBe("[85% · 3/4 done] Launch capture");
  });
  it("does not count delayed or unknown statuses as completed", () => {
    expect(clickUpJobProgress([task("delayed"), task("in_progress"), { status: null }]).completed).toBe(0);
  });
  it("counts planned deliverables but never double-counts their generated tasks", () => {
    const progress = clickUpJobProgress([task("posted_done", "reel"), task("posted_done")], [
      { id: "reel", name: "Reel", date: null }, { id: "photos", name: "Photos", date: null },
    ]);
    expect(progress).toEqual({ completed: 2, total: 3, percent: 67 });
    expect(clickUpJobProgress([], [{ id: "reel", name: "Reel", date: null }])).toEqual({ completed: 0, total: 1, percent: 0 });
  });
  it("shows status progress for standalone jobs and keeps titles untouched when progress is not supplied", () => {
    expect(clickUpJobTitle("Launch", clickUpJobProgress([], [], "production"))).toBe("[50% · status] Launch");
    expect(clickUpJobTitle("Launch")).toBe("Launch");
    expect(clickUpJobTitle("Launch", clickUpJobProgress([task("posted_done")]))).toBe("[100% · 1/1 done] Launch");
  });
  it("removes only the valid machine-generated prefix, preserving real title text", () => {
    expect(undecoratedClickUpJobTitle("[3/4 · 75%] Launch [Version 2]")).toBe("Launch [Version 2]");
    expect(undecoratedClickUpJobTitle("[68% · 0/4 done] Launch")).toBe("Launch");
    expect(undecoratedClickUpJobTitle("[90% · status] Launch")).toBe("Launch");
    expect(undecoratedClickUpJobTitle("[99% · 999/1000 done] Launch")).toBe("Launch");
    for (const title of ["[3/4] Launch", "[5/4 · 125%] Launch", "[0/0 · 0%] Launch", "[3/4 · 20%] Launch", "Launch · 75%", "[3/4 · 75%] ", "[101% · status] Launch", "[100% · 0/4 done] Launch", "[99% · 4/4 done] Launch", "[10% · 3/4 done] Launch"]) {
      expect(undecoratedClickUpJobTitle(title)).toBe(title);
    }
  });
});
