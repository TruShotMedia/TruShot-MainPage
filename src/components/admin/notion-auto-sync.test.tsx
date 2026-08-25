// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotionAutoSync } from "./notion-auto-sync";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  syncNotionImport: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/admin/actions", () => ({ syncNotionImport: mocks.syncNotionImport }));

describe("NotionAutoSync", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    mocks.refresh.mockClear();
    mocks.syncNotionImport.mockReset();
    mocks.syncNotionImport.mockResolvedValue({
      status: "completed",
      created: { clients: 0, jobs: 1, tasks: 0 },
      linked: { clients: 0, jobs: 0, tasks: 0 },
      scanned: { clients: 2, jobs: 3, tasks: 4 },
      unresolvedTasks: 0,
      warnings: [],
      message: "1 new record imported.",
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("requests one sync on page load, refreshes after an import, and respects the browser cooldown", async () => {
    await act(async () => root.render(<NotionAutoSync enabled intervalMinutes={15} />));
    await act(async () => Promise.resolve());

    expect(mocks.syncNotionImport).toHaveBeenCalledTimes(1);
    expect(mocks.syncNotionImport).toHaveBeenCalledWith(false);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<NotionAutoSync enabled intervalMinutes={15} />));
    await act(async () => Promise.resolve());
    expect(mocks.syncNotionImport).toHaveBeenCalledTimes(1);
  });
});
