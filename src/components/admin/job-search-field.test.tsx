// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobSearchField } from "./job-search-field";

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
});
