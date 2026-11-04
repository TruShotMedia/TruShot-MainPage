// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateDeliverableTasksButton } from "./create-deliverable-tasks-button";
const support = vi.hoisted(() => ({ data: null as null | { linkedTasks: { source_deliverable_id: string }[] }, error: "", reload: vi.fn() }));
vi.mock("./job-supporting-data", () => ({ useJobSupportingData: () => support }));
beforeEach(() => {
  vi.clearAllMocks(); support.data = null; support.error = "";
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => vi.restoreAllMocks());
describe("create tasks from deliverables", () => {
  for (const editing of [false, true]) it(`explains automatic task creation without a manual button (editing=${editing})`, async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    try {
      await act(async () => root.render(<form><input name="title" defaultValue="Updated brief" /><CreateDeliverableTasksButton jobId="job-id" requireSaved={editing} /></form>));
      expect(container.textContent).toContain("Deliverables become tasks automatically when you save.");
      expect(container.textContent).toContain("Progress, hours and notes are kept.");
      expect(container.querySelector("button")).toBeNull();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
  it("shows existing linked tasks without offering duplicate generation", async () => {
    support.data = { linkedTasks: [{ source_deliverable_id: "item" }] };
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(<CreateDeliverableTasksButton jobId="job" deliverables={[{ id: "item", name: "Reel", date: null }]} />));
      expect(container.textContent).toContain("1 deliverables · tasks linked");
      expect(container.querySelector("button")).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });
});
