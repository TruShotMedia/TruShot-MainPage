// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobStatus, TabletJobRecord } from "@/lib/types";
import { TabletJobPipeline } from "./tablet-job-pipeline";
import { ProductionTeamProvider } from "@/components/autopacific/team-context";

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

const finalStageJob: TabletJobRecord = {
  ...job,
  id: "66666666-6666-4666-8666-666666666666",
  title: "Final review",
  status_id: statuses[1].id,
  status: statuses[1],
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

  it.each([true, false])("uses status progress only for taskless cards with editable=%s", async editable => {
    const workflow: JobStatus[] = ["planning", "scheduled", "in_production", "client_review", "delivered"].map((key, index) => ({
      id: key, key, label: key === "in_production" ? "In Production" : key, color: "#579", position: index, is_closed: key === "delivered",
    }));
    const taskless = { ...job, title: "Taskless shoot", total_tasks: 0, open_tasks: 0, status_id: workflow[2].id, status: workflow[2] };
    const withTasks = { ...taskless, id: "with-tasks", title: "Edited clips", total_tasks: 3, completed_tasks: 1, open_tasks: 2 };
    await act(async () => root.render(<ProductionTeamProvider value={{ userId: "john", role: "manager", canManage: true, videographerId: "john", members: [] }}>
      <TabletJobPipeline editable={editable} initialJobs={[taskless, withTasks]} statuses={workflow} visibleStatusKeys={["in_production"]} onDuplicateJob={vi.fn()} onEditJob={vi.fn()} onViewJob={vi.fn()} />
    </ProductionTeamProvider>));
    const statusProgress = container.querySelector<HTMLProgressElement>('[aria-label="Job progress for Taskless shoot"]')!;
    expect(statusProgress.value).toBe(50);
    expect(statusProgress.getAttribute("aria-valuetext")).toBe("50% · Status: In Production");
    expect(container.textContent).toContain("Status: In Production");
    expect(container.querySelector<HTMLProgressElement>('[aria-label="Job progress for Edited clips"]')!.value).toBe(33);
    expect(container.textContent).toContain("1 of 3 tasks complete");
    expect(container.textContent).not.toContain("No tasks yet");
  });

  it("shows jobs grouped by status with edit and drag controls", async () => {
    const onEditJob = vi.fn();
    const onDuplicateJob = vi.fn();
    await act(async () => root.render(<TabletJobPipeline initialJobs={[job, finalStageJob]} statuses={statuses} onDuplicateJob={onDuplicateJob} onEditJob={onEditJob} onViewJob={vi.fn()} />));

    expect(container.querySelectorAll(".tablet-job-column")).toHaveLength(2);
    expect(container.textContent).not.toContain("Delivered");
    expect(container.textContent).toContain("Launch campaign");
    expect(container.textContent).toContain("Ravish Media");
    expect(container.querySelector('[aria-label="Shoot 14 Oct 2026 · Due 16 Oct 2026"]')).not.toBeNull();
    expect(container.querySelectorAll(".tablet-job-card-schedule")).toHaveLength(2);
    expect(container.textContent).not.toContain("TS-104");
    expect(container.textContent).toContain("2open · 3 total");
    expect(container.querySelector('[aria-label="Move Launch campaign"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Mark Final review as delivered"]')).not.toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Edit Launch campaign"]')!.click());
    expect(onEditJob).toHaveBeenCalledWith(job);

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Duplicate Launch campaign"]')!.click());
    expect(onDuplicateJob).toHaveBeenCalledWith(job);

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Mark Final review as delivered"]')!.click());
    expect(actionMocks.bulkUpdateJobStatus).toHaveBeenCalledWith([finalStageJob.id], statuses[2].id);
    expect([...container.querySelectorAll(".tablet-job-card h3")].map((heading) => heading.textContent)).not.toContain("Final review");
  });

  it("keeps job workflow controls available while detail editing is disabled", async () => {
    const onEditJob = vi.fn();
    const onViewJob = vi.fn();
    await act(async () => root.render(<TabletJobPipeline editable={false} initialJobs={[finalStageJob]} statuses={statuses} onDuplicateJob={vi.fn()} onEditJob={onEditJob} onViewJob={onViewJob} />));

    expect(container.querySelectorAll(".tablet-job-column")).toHaveLength(2);
    expect(container.textContent).not.toContain("Delivered");
    expect(container.querySelector(".tablet-job-card")?.classList.contains("is-read-only")).toBe(true);
    expect(container.querySelector('[aria-label="Move Final review"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Mark Final review as delivered"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Edit Final review"]')).toBeNull();
    expect(container.querySelector('[aria-label="Duplicate Final review"]')).toBeNull();
    expect(container.querySelector('[aria-label="View details for Final review"]')).not.toBeNull();
    expect(container.textContent).toContain("Drop a job here");

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="View details for Final review"]')!.click());
    expect(onViewJob).toHaveBeenCalledWith(finalStageJob);

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Mark Final review as delivered"]')!.click());
    expect(actionMocks.bulkUpdateJobStatus).toHaveBeenCalledWith([finalStageJob.id], statuses[2].id);
    expect([...container.querySelectorAll(".tablet-job-card h3")].map((heading) => heading.textContent)).not.toContain("Final review");
  });

  const planning = { ...statuses[0], id: "plan", key: "planning", label: "Planning" };
  const scheduled = { ...statuses[1], id: "scheduled", key: "scheduled", label: "Scheduled" };

  it("schedules a dated planning job using the existing status action", async () => {
    const planningJob = { ...job, status_id: planning.id, status: planning };
    const changed = vi.fn();
    await act(async () => root.render(<TabletJobPipeline initialJobs={[planningJob]} statuses={[planning, scheduled]} visibleStatusKeys={["planning"]} enableCompletion={false} onDuplicateJob={vi.fn()} onEditJob={vi.fn()} onJobsChange={changed} onViewJob={vi.fn()} />));
    const button = container.querySelector<HTMLButtonElement>(".tablet-job-schedule-button")!;
    expect(button.textContent).toContain("Move to Scheduled");
    await act(async () => button.click());
    expect(actionMocks.bulkUpdateJobStatus).toHaveBeenCalledWith([job.id], scheduled.id);
    expect(changed).toHaveBeenCalledWith([expect.objectContaining({ status_id: scheduled.id })]);
    expect(container.querySelector(".tablet-job-card")).toBeNull();
  });

  it("asks for a shoot date before scheduling an undated planning job", async () => {
    const undatedJob = { ...job, shoot_date: null, due_date: null, status_id: planning.id, status: planning };
    const edit = vi.fn();
    await act(async () => root.render(<TabletJobPipeline initialJobs={[undatedJob]} statuses={[planning, scheduled]} enableCompletion={false} onDuplicateJob={vi.fn()} onEditJob={edit} onViewJob={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>(".tablet-job-schedule-button")!.click());
    expect(edit).toHaveBeenCalledWith({ ...undatedJob, status_id: scheduled.id, status: scheduled });
    expect(actionMocks.bulkUpdateJobStatus).not.toHaveBeenCalled();
    expect(container.querySelector(".tablet-job-card")).not.toBeNull();
    expect(container.textContent).toContain("Choose a shoot date");
  });

  it("restores the planning card if scheduling fails", async () => {
    actionMocks.bulkUpdateJobStatus.mockRejectedValueOnce(new Error("Save failed"));
    await act(async () => root.render(<TabletJobPipeline initialJobs={[{ ...job, status_id: planning.id, status: planning }]} statuses={[planning, scheduled]} visibleStatusKeys={["planning"]} enableCompletion={false} onDuplicateJob={vi.fn()} onEditJob={vi.fn()} onViewJob={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>(".tablet-job-schedule-button")!.click());
    expect(container.querySelector(".tablet-job-card")).not.toBeNull();
    expect(container.textContent).toContain("Its card has been restored");
  });

  it("does not expose scheduling buttons with editing disabled", async () => {
    await act(async () => root.render(<TabletJobPipeline editable={false} initialJobs={[{ ...job, status_id: planning.id, status: planning }]} statuses={[planning, scheduled]} onDuplicateJob={vi.fn()} onEditJob={vi.fn()} onViewJob={vi.fn()} />));
    expect(container.querySelector(".tablet-job-schedule-button")).toBeNull();
  });
});
