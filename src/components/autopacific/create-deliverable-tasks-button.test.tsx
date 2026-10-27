// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateDeliverableTasksButton } from "./create-deliverable-tasks-button";
const mocks = vi.hoisted(() => ({ save: vi.fn(), create: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/admin/actions", () => ({ updateTabletJob: mocks.save, createDeliverableTasks: mocks.create }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.save.mockResolvedValue({ ok: true }); mocks.create.mockResolvedValue({ createdCount: 2, existingCount: 1 });
});
afterEach(() => vi.restoreAllMocks());
describe("create tasks from deliverables", () => {
  for (const editing of [false, true]) it(editing ? "saves the current editor before generating tasks" : "generates tasks directly from job details", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    try {
      await act(async () => root.render(<form><input name="title" defaultValue="Updated brief" /><CreateDeliverableTasksButton jobId="job-id" requireSaved={editing} /></form>));
      await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
      expect(mocks.create).toHaveBeenCalledWith("job-id"); expect(mocks.save).toHaveBeenCalledTimes(editing ? 1 : 0);
      if (editing) expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
      expect(container.textContent).toContain("2 tasks created · 1 already linked."); expect(mocks.refresh).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});
