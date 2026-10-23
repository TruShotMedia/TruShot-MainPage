import { describe, expect, it } from "vitest";
import { scopeTabletKioskDataByClient } from "@/lib/tablet-client-scope";
import type { TabletKioskData } from "@/lib/types";

function makeData(): TabletKioskData {
  return {
    statuses: [{ id: "task-open", key: "not_started", label: "Not started", color: "#777", position: 1, is_open: true }],
    jobStatuses: [{ id: "job-open", key: "not_started", label: "Not started", color: "#777", position: 1, is_closed: false }],
    clientOptions: [
      { id: "client-auto", name: "Autopacific Group" },
      { id: "client-other", name: "Another Client" },
    ],
    jobOptions: [
      { id: "job-auto", name: "Autopacific shoot", clientName: "Autopacific Group" },
      { id: "job-other", name: "Other shoot", clientName: "Another Client" },
    ],
    pipelineJobs: [
      { id: "job-auto", title: "Autopacific shoot", job_number: null, client_id: "client-auto", status_id: "job-open", shoot_date: null, shoot_time: null, due_date: null, due_time: null, photos_delivered: 0, location: null, delivery_url: null, description: null, notes: null, delivered_at: null, updated_at: "2026-10-15T00:00:00.000Z", open_tasks: 1, total_tasks: 1, client: { id: "client-auto", name: "Autopacific Group" }, status: null },
      { id: "job-other", title: "Other shoot", job_number: null, client_id: "client-other", status_id: "job-open", shoot_date: null, shoot_time: null, due_date: null, due_time: null, photos_delivered: 0, location: null, delivery_url: null, description: null, notes: null, delivered_at: null, updated_at: "2026-10-15T00:00:00.000Z", open_tasks: 1, total_tasks: 1, client: { id: "client-other", name: "Another Client" }, status: null },
    ],
    pipelineTasks: [
      { id: "task-auto", title: "Autopacific asset", job_id: "job-auto", status_id: "task-open", asset_type: "Asset", hours: 1, due_date: null, due_time: null, priority: "normal", description: null, position: 1, completed_at: null, updated_at: "2026-10-15T00:00:00.000Z" },
      { id: "task-other", title: "Other asset", job_id: "job-other", status_id: "task-open", asset_type: "Asset", hours: 1, due_date: null, due_time: null, priority: "normal", description: null, position: 2, completed_at: null, updated_at: "2026-10-15T00:00:00.000Z" },
    ],
    calendarJobs: [
      { id: "job-auto", entity_type: "job", title: "Autopacific shoot", client_name: "Autopacific Group", shoot_date: null, shoot_time: null, due_date: null, due_time: null, status_label: "Not started", status_color: "#777", is_complete: false },
      { id: "job-other", entity_type: "job", title: "Other shoot", client_name: "Another Client", shoot_date: null, shoot_time: null, due_date: null, due_time: null, status_label: "Not started", status_color: "#777", is_complete: false },
    ],
    calendarTasks: [
      { id: "task-auto", entity_type: "task", title: "Autopacific asset", job_title: "Autopacific shoot", client_name: "Autopacific Group", due_date: null, due_time: null, priority: "normal", status_label: "Not started", status_color: "#777", is_complete: false },
      { id: "task-other", entity_type: "task", title: "Other asset", job_title: "Other shoot", client_name: "Another Client", due_date: null, due_time: null, priority: "normal", status_label: "Not started", status_color: "#777", is_complete: false },
    ],
    calendarCampaignAssets: [
      { id: "campaign-auto", entity_type: "campaign-asset", title: "Autopacific campaign", campaign_title: "Launch", client_name: "Autopacific Group", start_date: null, start_time: null, due_date: null, due_time: null, priority: "normal", status_label: "Not started", status_color: "#777", is_complete: false },
      { id: "campaign-other", entity_type: "campaign-asset", title: "Other campaign", campaign_title: "Other", client_name: "Another Client", start_date: null, start_time: null, due_date: null, due_time: null, priority: "normal", status_label: "Not started", status_color: "#777", is_complete: false },
    ],
    calendarEvents: [{ id: "event-1", entity_type: "calendar-event", client_id: null, client_name: null, title: "Studio event", description: null, location: null, start_date: "2026-10-15", start_time: null, end_date: "2026-10-15", end_time: null, is_all_day: true, color: "#1f5e41", reminder_offsets_minutes: [], created_at: "2026-10-15T00:00:00.000Z", updated_at: "2026-10-15T00:00:00.000Z" }],
    flightEvents: [],
    pendingRequestCount: 3,
  };
}

describe("scopeTabletKioskDataByClient", () => {
  it("keeps only the selected client's jobs, tasks, options and related calendar work", () => {
    const scoped = scopeTabletKioskDataByClient(makeData(), "  AUTOPACIFIC group ");

    expect(scoped.clientOptions.map((client) => client.id)).toEqual(["client-auto"]);
    expect(scoped.jobOptions.map((job) => job.id)).toEqual(["job-auto"]);
    expect(scoped.pipelineJobs.map((job) => job.id)).toEqual(["job-auto"]);
    expect(scoped.pipelineTasks.map((task) => task.id)).toEqual(["task-auto"]);
    expect(scoped.calendarJobs.map((job) => job.id)).toEqual(["job-auto"]);
    expect(scoped.calendarTasks.map((task) => task.id)).toEqual(["task-auto"]);
    expect(scoped.calendarCampaignAssets.map((asset) => asset.id)).toEqual(["campaign-auto"]);
    expect(scoped.calendarEvents.map((event) => event.id)).toEqual(["event-1"]);
    expect(scoped.statuses).toHaveLength(1);
    expect(scoped.jobStatuses).toHaveLength(1);
    expect(scoped.pendingRequestCount).toBe(3);
  });

  it("returns no client-owned records when the requested client does not exist", () => {
    const scoped = scopeTabletKioskDataByClient(makeData(), "Missing Client");

    expect(scoped.clientOptions).toEqual([]);
    expect(scoped.jobOptions).toEqual([]);
    expect(scoped.pipelineJobs).toEqual([]);
    expect(scoped.pipelineTasks).toEqual([]);
    expect(scoped.calendarJobs).toEqual([]);
    expect(scoped.calendarTasks).toEqual([]);
    expect(scoped.calendarCampaignAssets).toEqual([]);
  });

  it("can retain the full calendar while keeping the boards scoped to one client", () => {
    const scoped = scopeTabletKioskDataByClient(makeData(), "Autopacific Group", { includeOtherCalendarItems: true });

    expect(scoped.pipelineJobs.map((job) => job.id)).toEqual(["job-auto"]);
    expect(scoped.pipelineTasks.map((task) => task.id)).toEqual(["task-auto"]);
    expect(scoped.calendarJobs.map((job) => job.id)).toEqual(["job-auto", "job-other"]);
    expect(scoped.calendarTasks.map((task) => task.id)).toEqual(["task-auto", "task-other"]);
    expect(scoped.calendarCampaignAssets.map((asset) => asset.id)).toEqual(["campaign-auto", "campaign-other"]);
  });
});
