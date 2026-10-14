// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarJob, JobStatus, TaskStatus } from "@/lib/types";
import { TabletRecordCreateEditor, TabletScheduleEditor } from "./tablet-workspace-editors";

const actionMocks = vi.hoisted(() => ({
  createJob: vi.fn(async (formData: FormData) => { void formData; }),
  createTask: vi.fn(async (formData: FormData) => { void formData; }),
  updateCalendarItem: vi.fn(async (formData: FormData) => { void formData; return { ok: true }; }),
}));

vi.mock("@/app/admin/actions", () => actionMocks);
vi.mock("@/components/admin/job-search-field", () => ({ JobSearchField: () => <input type="hidden" name="job_id" value="33333333-3333-4333-8333-333333333333" /> }));

const jobStatuses: JobStatus[] = [{ id: "11111111-1111-4111-8111-111111111111", key: "not_started", label: "Not started", color: "#777773", position: 1, is_closed: false }];
const taskStatuses: TaskStatus[] = [{ id: "22222222-2222-4222-8222-222222222222", key: "not_started", label: "Not started", color: "#777773", position: 1, is_open: true }];

describe("tablet workspace editors", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    actionMocks.createJob.mockClear();
    actionMocks.createTask.mockClear();
    actionMocks.updateCalendarItem.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("creates a job through the existing authenticated CRM action", async () => {
    const onCreated = vi.fn();
    await act(async () => root.render(
      <TabletRecordCreateEditor clientOptions={[]} defaultDate="2026-10-14" jobOptions={[]} jobStatuses={jobStatuses} kind="job" onClose={vi.fn()} onCreated={onCreated} taskStatuses={taskStatuses} />,
    ));
    const titleInput = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    titleInput.value = "Tablet production day";
    const form = container.querySelector<HTMLFormElement>("form")!;
    await act(async () => form.requestSubmit());

    expect(actionMocks.createJob).toHaveBeenCalledOnce();
    const formData = actionMocks.createJob.mock.calls[0]?.[0];
    expect(formData.get("title")).toBe("Tablet production day");
    expect(formData.get("shoot_date")).toBe("2026-10-14");
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("updates an existing calendar job through the shared schedule action", async () => {
    const job: CalendarJob = {
      id: "44444444-4444-4444-8444-444444444444",
      entity_type: "job",
      title: "Campaign shoot",
      client_name: "Ravish Media",
      shoot_date: "2026-10-14",
      shoot_time: "09:00:00",
      due_date: "2026-10-16",
      due_time: "17:00:00",
      status_label: "In progress",
      status_color: "#3975ad",
      is_complete: false,
    };
    const onSaved = vi.fn();
    await act(async () => root.render(<TabletScheduleEditor item={job} onClose={vi.fn()} onSaved={onSaved} />));
    const form = container.querySelector<HTMLFormElement>("form")!;
    await act(async () => form.requestSubmit());

    expect(actionMocks.updateCalendarItem).toHaveBeenCalledOnce();
    const formData = actionMocks.updateCalendarItem.mock.calls[0]?.[0];
    expect(formData.get("entity_type")).toBe("job");
    expect(formData.get("due_date")).toBe("2026-10-16");
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
