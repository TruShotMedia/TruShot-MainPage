// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarJob, JobStatus, PipelineTask, TabletJobRecord, TaskStatus } from "@/lib/types";
import { TabletRecordCreateEditor, TabletRecordEditEditor, TabletScheduleEditor } from "./tablet-workspace-editors";

const actionMocks = vi.hoisted(() => ({
  archiveJob: vi.fn(async (formData: FormData) => { void formData; return { ok: true }; }),
  archiveTask: vi.fn(async (formData: FormData) => { void formData; return { ok: true }; }),
  createJob: vi.fn(async (formData: FormData) => { void formData; }),
  createTask: vi.fn(async (formData: FormData) => { void formData; }),
  updateCalendarItem: vi.fn(async (formData: FormData) => { void formData; return { ok: true }; }),
  updateTabletJob: vi.fn(async (formData: FormData) => { void formData; return { ok: true }; }),
  updateTask: vi.fn(async (formData: FormData) => { void formData; }),
}));

vi.mock("@/app/admin/actions", () => actionMocks);
vi.mock("@/components/admin/job-search-field", () => ({ JobSearchField: ({ defaultJobId }: { defaultJobId?: string }) => <input type="hidden" name="job_id" value={defaultJobId ?? "33333333-3333-4333-8333-333333333333"} /> }));

const jobStatuses: JobStatus[] = [{ id: "11111111-1111-4111-8111-111111111111", key: "not_started", label: "Not started", color: "#777773", position: 1, is_closed: false }];
const taskStatuses: TaskStatus[] = [{ id: "22222222-2222-4222-8222-222222222222", key: "not_started", label: "Not started", color: "#777773", position: 1, is_open: true }];

describe("tablet workspace editors", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    actionMocks.createJob.mockClear();
    actionMocks.createTask.mockClear();
    actionMocks.archiveJob.mockClear();
    actionMocks.archiveTask.mockClear();
    actionMocks.updateCalendarItem.mockClear();
    actionMocks.updateTabletJob.mockClear();
    actionMocks.updateTask.mockClear();
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
      <TabletRecordCreateEditor clientOptions={[{ id: "client-auto", name: "Autopacific Group" }]} defaultDate="2026-10-14" jobOptions={[]} jobStatuses={jobStatuses} kind="job" onClose={vi.fn()} onCreated={onCreated} taskStatuses={taskStatuses} />,
    ));
    const titleInput = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    titleInput.value = "Tablet production day";
    const form = container.querySelector<HTMLFormElement>("form")!;
    await act(async () => form.requestSubmit());

    expect(actionMocks.createJob).toHaveBeenCalledOnce();
    const formData = actionMocks.createJob.mock.calls[0]?.[0];
    expect(formData.get("title")).toBe("Tablet production day");
    expect(formData.get("client_id")).toBe("client-auto");
    expect(formData.get("shoot_date")).toBe("2026-10-14");
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("opens a duplicate job as a pre-filled new record and resets delivered output", async () => {
    const source: TabletJobRecord = {
      id: "44444444-4444-4444-8444-444444444444",
      title: "Autopacific launch shoot",
      job_number: "AP-104",
      client_id: "55555555-5555-4555-8555-555555555555",
      status_id: jobStatuses[0].id,
      shoot_date: "2026-10-20",
      shoot_time: "09:30:00",
      due_date: "2026-10-23",
      due_time: "17:00:00",
      photos_delivered: 45,
      location: "Brendale",
      delivery_url: "https://example.com/delivery",
      description: "Launch photography and video",
      notes: "Use the loading bay",
      key_deliverables: ["Launch reel", "5 photographs"],
      delivered_at: null,
      updated_at: "2026-10-15T00:00:00.000Z",
      open_tasks: 3,
      total_tasks: 3,
      client: { id: "55555555-5555-4555-8555-555555555555", name: "Autopacific Group" },
      status: jobStatuses[0],
    };

    await act(async () => root.render(
      <TabletRecordCreateEditor
        clientOptions={[source.client!]}
        fixedClientId={source.client_id!}
        defaultDate="2026-10-20"
        jobOptions={[]}
        jobStatuses={jobStatuses}
        kind="job"
        onClose={vi.fn()}
        onCreated={vi.fn()}
        sourceRecord={source}
        taskStatuses={taskStatuses}
      />,
    ));

    expect(container.querySelector("h2")?.textContent).toBe("Duplicate this job");
    expect(container.querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe(source.title);
    expect(container.querySelector<HTMLInputElement>('input[name="location"]')?.value).toBe(source.location);
    expect(container.querySelector<HTMLInputElement>('input[name="photos_delivered"]')?.value).toBe("0");
    expect(container.querySelector('select[name="client_id"]')).toBeNull();
    expect(container.querySelector('input[name="photos_delivered"][type="number"]')).toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('textarea[name="key_deliverables"]')?.value).toBe("Launch reel\n5 photographs");
    await act(async () => container.querySelector<HTMLFormElement>("form")!.requestSubmit());

    const formData = actionMocks.createJob.mock.calls[0]?.[0];
    expect(formData.get("client_id")).toBe(source.client_id);
    expect(formData.get("shoot_date")).toBe(source.shoot_date);
    expect(formData.get("delivery_url")).toBe(source.delivery_url);
    expect(formData.get("notes")).toBe(source.notes);
    expect(formData.get("key_deliverables")).toBe("Launch reel\n5 photographs");
  });

  it("opens a duplicate task as a pre-filled new record", async () => {
    const source: PipelineTask = {
      id: "66666666-6666-4666-8666-666666666666",
      title: "Launch reel",
      job_id: "33333333-3333-4333-8333-333333333333",
      status_id: taskStatuses[0].id,
      asset_type: "Asset",
      hours: 2.5,
      due_date: "2026-10-23",
      due_time: "15:30:00",
      priority: "high",
      description: "Vertical launch edit",
      position: 10,
      completed_at: null,
      updated_at: "2026-10-15T00:00:00.000Z",
    };

    await act(async () => root.render(
      <TabletRecordCreateEditor
        clientOptions={[]}
        defaultDate="2026-10-15"
        jobOptions={[{ id: source.job_id, name: "Autopacific launch shoot" }]}
        jobStatuses={jobStatuses}
        kind="task"
        onClose={vi.fn()}
        onCreated={vi.fn()}
        sourceRecord={source}
        taskStatuses={taskStatuses}
      />,
    ));

    expect(container.querySelector("h2")?.textContent).toBe("Duplicate this task / asset");
    expect(container.querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe(source.title);
    expect(container.querySelector<HTMLInputElement>('input[name="hours"]')?.value).toBe("2.5");
    await act(async () => container.querySelector<HTMLFormElement>("form")!.requestSubmit());

    const formData = actionMocks.createTask.mock.calls[0]?.[0];
    expect(formData.get("job_id")).toBe(source.job_id);
    expect(formData.get("priority")).toBe(source.priority);
    expect(formData.get("description")).toBe(source.description);
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

  it("edits and safely removes a job from the tablet workspace", async () => {
    const record: TabletJobRecord = {
      id: "44444444-4444-4444-8444-444444444444",
      title: "Campaign shoot",
      job_number: "TS-104",
      client_id: null,
      status_id: jobStatuses[0].id,
      shoot_date: "2026-10-14",
      shoot_time: "09:00:00",
      due_date: "2026-10-16",
      due_time: "17:00:00",
      photos_delivered: 12,
      location: "Geebung",
      delivery_url: null,
      description: "Launch production",
      notes: null,
      delivered_at: null,
      updated_at: "2026-10-14T00:00:00.000Z",
      open_tasks: 2,
      total_tasks: 3,
      client: null,
      status: jobStatuses[0],
    };
    const onSaved = vi.fn();
    await act(async () => root.render(
      <TabletRecordEditEditor clientOptions={[]} jobOptions={[]} jobStatuses={jobStatuses} onClose={vi.fn()} onSaved={onSaved} record={record} taskStatuses={taskStatuses} type="job" />,
    ));
    const title = container.querySelector<HTMLInputElement>('input[name="title"]')!;
    title.value = "Updated campaign shoot";
    await act(async () => container.querySelector<HTMLFormElement>("form")!.requestSubmit());

    expect(actionMocks.updateTabletJob).toHaveBeenCalledOnce();
    expect(actionMocks.updateTabletJob.mock.calls[0]?.[0].get("title")).toBe("Updated campaign shoot");
    expect(onSaved).toHaveBeenCalledOnce();

    onSaved.mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const deleteButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Delete"))!;
    await act(async () => deleteButton.click());
    expect(actionMocks.archiveJob).toHaveBeenCalledOnce();
    expect(actionMocks.archiveJob.mock.calls[0]?.[0].get("id")).toBe(record.id);
    expect(onSaved).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});
