// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobSearchField } from "./job-search-field";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";

const jobs = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Brand launch shoot", jobNumber: "JOB-24", clientName: "Ravish Media", dueDate: "2026-09-20" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Monthly social content", jobNumber: "JOB-25", clientName: "Acme", dueDate: "2026-09-28" },
];

describe("JobSearchField", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("searches job, client and job number before storing a valid job relation", async () => {
    await act(async () => root.render(<form><JobSearchField jobs={jobs} /></form>));
    const search = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    const relation = container.querySelector<HTMLInputElement>('input[name="job_id"]')!;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Ravish");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const option = container.querySelector<HTMLButtonElement>('[role="option"]')!;
    expect(option.textContent).toContain("Brand launch shoot");
    expect(option.textContent).toContain("JOB-24");
    await act(async () => option.click());

    expect(relation.value).toBe(jobs[0].id);
    expect(search.value).toBe("Brand launch shoot");
    expect(container.textContent).toContain("Task deadline:");
    expect(container.textContent).toContain("20 Sept 2026");
  });

  it("supports keyboard selection and restores the original job when the form resets", async () => {
    await act(async () => root.render(<form><JobSearchField jobs={jobs} defaultJobId={jobs[1].id} /></form>));
    const form = container.querySelector("form")!;
    const search = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    const relation = container.querySelector<HTMLInputElement>('input[name="job_id"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "JOB-24");
      search.dispatchEvent(new Event("input", { bubbles: true }));
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(relation.value).toBe(jobs[0].id);
    await act(async () => form.reset());
    expect(relation.value).toBe(jobs[1].id);
    expect(search.value).toBe("Monthly social content");
  });

  it("keeps the selected row, keyboard highlight and Escape dismissal independent of legacy invoice styling", async () => {
    await act(async () => root.render(<form><JobSearchField jobs={jobs} defaultJobId={jobs[0].id} /></form>));
    const search = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    await act(async () => search.focus());
    const option = container.querySelector<HTMLElement>('[role="option"]')!;
    expect(option.getAttribute("aria-selected")).toBe("true");
    expect(option.dataset.active).toBe("true");
    expect(search.getAttribute("aria-activedescendant")).toBe(option.id);
    expect(container.querySelector(".job-search-control > svg")).not.toBeNull();
    expect(container.querySelector(".job-search-confirmed")).not.toBeNull();
    expect(container.querySelector(".invoice-search-control,.invoice-search-results")).toBeNull();
    await act(async () => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(search.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[name="job_id"]')?.value).toBe(jobs[0].id);
  });

  it("shows the empty state without retaining a stale relation", async () => {
    await act(async () => root.render(<form><JobSearchField jobs={jobs} defaultJobId={jobs[0].id} /></form>));
    const search = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Missing shoot");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[role="listbox"]')?.textContent).toBe("No matching jobs.");
    expect(container.querySelector<HTMLInputElement>('input[name="job_id"]')?.value).toBe("");
    expect(search.checkValidity()).toBe(false);
  });

  it.each(["light", "dark"])("renders a real %s editor fixture for visual theme checks", async theme => {
    if (!process.env.JOB_PICKER_PREVIEW_DIR) return;
    await act(async () => root.render(<main className={`apg-desktop is-${theme} theme-autopacific`}><WorkspaceDialog titleId="picker-preview-title" onClose={() => {}} header={<div><span>Edit asset</span><h2 id="picker-preview-title">Product launch reel</h2></div>} footer={<button type="button">Cancel</button>}><div className="tablet-record-editor-fields"><JobSearchField jobs={jobs} defaultJobId={jobs[0].id} /><label>Status<select defaultValue="progress"><option value="progress">In Progress</option></select></label><label>Asset type<select defaultValue="asset"><option value="asset">Asset</option></select></label></div></WorkspaceDialog></main>));
    await act(async () => container.querySelector<HTMLInputElement>('[role="combobox"]')!.focus());
    const css = ["src/app/globals.css", "src/app/workspace.css", "src/components/autopacific/production-desktop.css", "src/components/autopacific/production-mobile.css", "src/components/admin/job-search-field.css"].map(path => readFileSync(path, "utf8")).join("\n");
    writeFileSync(`${process.env.JOB_PICKER_PREVIEW_DIR}/job-picker-${theme}.html`, `<!doctype html><html class="apg-desktop-active"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Job picker · ${theme}</title><style>${css}</style></head><body>${container.innerHTML}</body></html>`);
  });
});
