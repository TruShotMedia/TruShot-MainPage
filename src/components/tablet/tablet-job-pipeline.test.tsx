// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobStatus, TabletJobRecord } from "@/lib/types";
import { TabletJobPipeline } from "./tablet-job-pipeline";

const actionMocks = vi.hoisted(() => ({
  bulkUpdateJobStatus: vi.fn(async () => ({ ok: true, updated: 1 })),
}));

vi.mock("@/app/admin/actions", () => actionMocks);

const statuses: JobStatus[] = [
  { id: "11111111-1111-4111-8111-111111111111", key: "not_started", label: "Not started", color: "#777773", position: 10, is_closed: false },
  { id: "22222222-2222-4222-8222-222222222222", key: "in_progress", label: "In progress", color: "#3975ad", position: 20, is_closed: false },
  { id: "33333333-3333-4333-8333-333333333333", key: "delivered", label: "Delivered", color: "#397253", position: 30, is_closed: true },
];

const job: TabletJobRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  title: "Launch campaign",
  job_number: "TS-104",
  client_id: "55555555-5555-4555-8555-555555555555",
  status_id: statuses[0].id,
  shoot_date: "2026-10-14",
  shoot_time: "09:00:00",
  due_date: "2026-10-16",
  due_time: "17:00:00",
  photos_delivered: 12,
  location: "Geebung",
  delivery_url: null,
  description: null,
  notes: null,
  delivered_at: null,
  updated_at: "2026-10-14T00:00:00.000Z",
  open_tasks: 2,
  total_tasks: 3,
  client: { id: "55555555-5555-4555-8555-555555555555", name: "Ravish Media" },
  status: statuses[0],
};

describe("TabletJobPipeline", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    actionMocks.bulkUpdateJobStatus.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows jobs grouped by status with edit and drag controls", async () => {
    const onEditJob = vi.fn();
    await act(async () => root.render(<TabletJobPipeline initialJobs={[job]} statuses={statuses} onEditJob={onEditJob} />));

    expect(container.querySelectorAll(".tablet-job-column")).toHaveLength(2);
    expect(container.textContent).not.toContain("Delivered");
    expect(container.textContent).toContain("Launch campaign");
    expect(container.textContent).toContain("Ravish Media");
    expect(container.textContent).toContain("2open · 3 total");
    expect(container.querySelector('[aria-label="Move Launch campaign"]')).not.toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Edit Launch campaign"]')!.click());
    expect(onEditJob).toHaveBeenCalledWith(job);
  });

  it("keeps job cards view-only until tablet editing is enabled", async () => {
    const onEditJob = vi.fn();
    await act(async () => root.render(<TabletJobPipeline editable={false} initialJobs={[job]} statuses={statuses} onEditJob={onEditJob} />));

    expect(container.querySelectorAll(".tablet-job-column")).toHaveLength(2);
    expect(container.textContent).not.toContain("Delivered");
    expect(container.querySelector(".tablet-job-card")?.classList.contains("is-read-only")).toBe(true);
    expect(container.querySelector('[aria-label="Move Launch campaign"]')).toBeNull();
    expect(container.querySelector('[aria-label="Edit Launch campaign"]')).toBeNull();
    expect(container.textContent).toContain("No jobs");
    expect(actionMocks.bulkUpdateJobStatus).not.toHaveBeenCalled();
  });
});
