// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarJob, CalendarTask } from "@/lib/types";
import { CalendarManager } from "./calendar-manager";

const navigationMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

vi.mock("@/app/admin/actions", () => ({
  updateCalendarItem: vi.fn(async () => ({ ok: true })),
}));

describe("CalendarManager completed work", () => {
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

  it("shows completed jobs and tasks greyed out by default and still allows hiding them", async () => {
    const date = format(new Date(), "yyyy-MM-dd");
    const jobs: CalendarJob[] = [{
      id: "11111111-1111-4111-8111-111111111111",
      entity_type: "job",
      title: "Completed campaign",
      client_name: "Ravish Media",
      shoot_date: null,
      due_date: date,
      status_label: "Delivered",
      status_color: "#397253",
      is_complete: true,
    }];
    const tasks: CalendarTask[] = [{
      id: "22222222-2222-4222-8222-222222222222",
      entity_type: "task",
      title: "Completed reel",
      job_title: "Completed campaign",
      client_name: "Ravish Media",
      due_date: date,
      priority: "normal",
      status_label: "Posted / Done",
      status_color: "#777773",
      is_complete: true,
    }];

    await act(async () => root.render(<CalendarManager jobs={jobs} tasks={tasks} />));

    expect(container.textContent).toContain("Completed campaign");
    expect(container.textContent).toContain("Completed reel");
    expect(container.querySelectorAll(".calendar-event.is-complete").length).toBeGreaterThanOrEqual(2);

    const completedToggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(completedToggle.checked).toBe(true);
    await act(async () => completedToggle.click());

    expect(container.textContent).not.toContain("Completed campaign");
    expect(container.textContent).not.toContain("Completed reel");
  });
});
