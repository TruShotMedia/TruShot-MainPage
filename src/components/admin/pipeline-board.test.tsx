// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineTask, TaskStatus } from "@/lib/types";
import { PipelineBoard } from "./pipeline-board";

const actionMocks = vi.hoisted(() => ({
  movePipelineTask: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/app/admin/actions", () => actionMocks);

const statuses: TaskStatus[] = [
  { id: "11111111-1111-4111-8111-111111111111", key: "not_started", label: "Not Started", color: "#777773", position: 10, is_open: true },
  { id: "22222222-2222-4222-8222-222222222222", key: "ready_to_post", label: "Ready To Post", color: "#397253", position: 20, is_open: true },
  { id: "33333333-3333-4333-8333-333333333333", key: "posted_done", label: "Posted / Done", color: "#777773", position: 30, is_open: false },
];

const readyTask: PipelineTask = {
  id: "44444444-4444-4444-8444-444444444444",
  title: "Launch reel",
  job_id: "55555555-5555-4555-8555-555555555555",
  status_id: statuses[1].id,
  asset_type: "video",
  hours: 2,
  due_date: "2026-08-26",
  priority: "high",
  description: null,
  position: 10,
  updated_at: "2026-08-25T00:00:00.000Z",
  job: { title: "Launch campaign", client: { name: "Ravish Media" } },
};

const completedTask: PipelineTask = {
  ...readyTask,
  id: "66666666-6666-4666-8666-666666666666",
  title: "Published reel",
  status_id: statuses[2].id,
};

describe("PipelineBoard tablet variant", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    actionMocks.movePipelineTask.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("hides Posted / Done and completes an asset from Ready To Post", async () => {
    await act(async () => {
      root.render(<PipelineBoard initialStatuses={statuses} initialTasks={[readyTask, completedTask]} variant="tablet" />);
    });

    expect(container.querySelector(".pipeline-board-tablet")).not.toBeNull();
    expect(container.textContent).toContain("Ready To Post");
    expect(container.textContent).toContain("Launch reel");
    expect(container.textContent).not.toContain("Posted / Done");
    expect(container.textContent).not.toContain("Published reel");

    const completeButton = container.querySelector<HTMLButtonElement>('[aria-label="Mark Launch reel as posted and done"]')!;
    await act(async () => completeButton.click());

    expect(actionMocks.movePipelineTask).toHaveBeenCalledWith(readyTask.id, statuses[2].id);
    expect([...container.querySelectorAll(".pipeline-task h3")].map((heading) => heading.textContent)).not.toContain("Launch reel");
    expect(container.textContent).toContain("marked Posted / Done");
  });
});
