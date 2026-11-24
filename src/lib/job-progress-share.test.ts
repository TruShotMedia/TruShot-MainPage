import { describe, expect, it, vi } from "vitest";
import { buildSharedJobProgress, clientDeliveryUrl } from "./job-progress-share";
import { createJobProgressPng } from "./job-progress-image";

describe("shared job progress", () => {
  const hidden = { notes: "Private notes", invoice: "Private invoice", location: "Private location" };
  const job = {
    ...hidden, title: "Example <film> & photography", status: { key: "in_production", label: "Production" },
    deliverables: [{ id: "a", name: "Original wording", date: null }, { id: "b", name: "Planned photos", date: null }],
  };
  const tasks = [
    { ...hidden, title: "Finished edit", source_deliverable_id: "a", status: { key: "posted_done" } },
    { ...hidden, title: "Hero cut", source_deliverable_id: null, status: { key: "final_draft_notes" } },
    { ...hidden, title: "Old attempt", source_deliverable_id: null, status: { key: "delayed" } },
  ];

  it("aligns with the CRM progress score and does not reveal private fields or double-count deliverables", () => {
    const report = buildSharedJobProgress(job, tasks);
    expect(report.progress).toEqual({ completed: 1, total: 3, percent: 63 });
    expect(report.stageIndex).toBe(2);
    expect(report.stages.map(stage => stage.items)).toEqual([["Planned photos"], [], [], ["Hero cut"], [], ["Finished edit"]]);
    expect(JSON.stringify(report)).not.toMatch(/Private|Original wording|Old attempt|source_deliverable_id/);
  });

  it("uses status-based progress for a standalone job", () => {
    expect(buildSharedJobProgress({ ...job, deliverables: [] }, []).progress).toEqual({ total: 0, completed: 0, percent: 50 });
  });

  it.each([null, " ", "javascript:void(0)", "data:text/html,example", "/relative", "https://user:secret@example.com"])(
    "does not expose invalid delivery URL %s",
    (value) => expect(clientDeliveryUrl(value)).toBeNull(),
  );

  it("preserves valid client delivery URLs including signed query parameters", () => {
    expect(clientDeliveryUrl(" https://example.com/delivery?key=abc%2B123 ")).toBe("https://example.com/delivery?key=abc%2B123");
  });

  it("draws the image in the browser, with the same progress and no private details", async () => {
    const fillText = vi.fn();
    const ctx = {
      beginPath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), roundRect: vi.fn(), arc: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillText, measureText: (value: string) => ({ width: value.length * 10 }),
    };
    const canvas = { width: 0, getContext: () => ctx, toBlob: vi.fn((callback: (blob: Blob) => void) => callback(new Blob(["PNG"], { type: "image/png" }))) };
    vi.stubGlobal("document", { createElement: () => canvas });
    try {
      const png = await createJobProgressPng(buildSharedJobProgress(job, tasks));
      expect(png.type).toBe("image/png");
      expect(canvas.width).toBe(1200);
      expect(canvas.toBlob.mock.calls[0]).toEqual([expect.any(Function), "image/png"]);
      expect(fillText.mock.calls.map(([label]) => label)).toEqual(expect.arrayContaining(["Example <film> & photography", "1 of 3 deliverables complete", "63%"]));
      expect(JSON.stringify(fillText.mock.calls)).not.toContain("Private");
    } finally { vi.unstubAllGlobals(); }
  });
});
