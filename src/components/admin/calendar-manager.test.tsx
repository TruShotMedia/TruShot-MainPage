// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarCampaignAsset, CalendarJob, CalendarTask } from "@/lib/types";
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

  it("renders a multi-day job as one continuous production window", async () => {
    const month = format(new Date(), "yyyy-MM");
    const jobs: CalendarJob[] = [{
      id: "33333333-3333-4333-8333-333333333333",
      entity_type: "job",
      title: "Launch campaign",
      client_name: "Ravish Media",
      shoot_date: `${month}-14`,
      due_date: `${month}-16`,
      status_label: "In progress",
      status_color: "#397253",
      is_complete: false,
    }];

    await act(async () => root.render(<CalendarManager jobs={jobs} tasks={[]} />));

    const rangeSegments = container.querySelectorAll<HTMLButtonElement>('.calendar-job-range[title*="Launch campaign"]');
    expect(rangeSegments.length).toBeGreaterThanOrEqual(1);
    expect([...rangeSegments].every((segment) => segment.title.includes("3 days"))).toBe(true);
    expect(container.querySelectorAll(".calendar-event-shoot")).toHaveLength(0);
    expect(container.querySelectorAll(".calendar-event-job-due")).toHaveLength(0);
    expect(container.querySelector(".calendar-mobile-job-range")?.textContent).toContain("14–16");
  });

  it("shows a dated campaign asset as a calendar range and filterable campaign item", async () => {
    const month = format(new Date(), "yyyy-MM");
    const campaignAssets: CalendarCampaignAsset[] = [{
      id: "44444444-4444-4444-8444-444444444444",
      entity_type: "campaign-asset",
      title: "Launch film",
      campaign_title: "Spring campaign",
      client_name: "Ravish Media",
      start_date: `${month}-10`,
      due_date: `${month}-13`,
      priority: "high",
      status_label: "In Progress",
      status_color: "#4B78A8",
      is_complete: false,
    }];

    await act(async () => root.render(<CalendarManager jobs={[]} tasks={[]} campaignAssets={campaignAssets} />));

    expect(container.querySelector('.calendar-job-range.is-campaign[title*="Launch film"]')).not.toBeNull();
    const campaignsFilter = [...container.querySelectorAll<HTMLButtonElement>(".calendar-filters button")].find((button) => button.textContent === "campaigns")!;
    await act(async () => campaignsFilter.click());
    expect(container.textContent).toContain("Launch film");
  });
});
