// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CalendarJob, CalendarTask } from "@/lib/types";
import { TabletCalendar } from "./tablet-calendar";

const jobs: CalendarJob[] = [{
  id: "11111111-1111-4111-8111-111111111111",
  entity_type: "job",
  title: "Launch campaign",
  client_name: "Ravish Media",
  shoot_date: "2026-08-14",
  shoot_time: null,
  due_date: "2026-08-16",
  due_time: null,
  status_label: "In progress",
  status_color: "#4778ad",
  is_complete: false,
}];

const tasks: CalendarTask[] = [{
  id: "22222222-2222-4222-8222-222222222222",
  entity_type: "task",
  title: "Published reel",
  job_title: "Launch campaign",
  client_name: "Ravish Media",
  due_date: "2026-08-18",
  due_time: null,
  priority: "normal",
  status_label: "Posted / Done",
  status_color: "#777773",
  is_complete: true,
}];

describe("TabletCalendar", () => {
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

  it("draws inclusive multi-day job bars and greys completed deadlines", async () => {
    await act(async () => root.render(<TabletCalendar jobs={jobs} tasks={tasks} today="2026-08-25" />));

    expect(container.querySelector("h1")?.textContent).toBe("August 2026");
    const range = container.querySelector<HTMLElement>('[aria-label*="scheduled 14–16 Aug"]');
    expect(range).not.toBeNull();
    expect(range?.getAttribute("aria-label")).toContain("3 days");
    expect(range?.style.gridColumn).toBe("5 / span 3");

    const completedDeadline = container.querySelector<HTMLElement>('[title^="Asset due: Published reel"]');
    expect(completedDeadline).not.toBeNull();
    expect(completedDeadline?.classList.contains("is-complete")).toBe(true);
  });
});
