// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceOption, JobRecord, JobStatus } from "@/lib/types";
import { StatusGroupedTable } from "./status-grouped-table";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const actionMocks = vi.hoisted(() => ({
  bulkUpdateJobStatus: vi.fn(async () => ({ ok: true, updated: 1 })),
  bulkUpdateTaskStatus: vi.fn(async () => ({ ok: true, updated: 1 })),
  linkJobsToInvoice: vi.fn(async () => ({ ok: true, linked: 1 })),
  updateJob: vi.fn(async () => undefined),
  updateTask: vi.fn(async () => undefined),
}));

vi.mock("@/app/admin/actions", () => actionMocks);

const statuses: JobStatus[] = [
  { id: "11111111-1111-4111-8111-111111111111", key: "planning", label: "Planning", color: "#777773", position: 10, is_closed: false },
  { id: "22222222-2222-4222-8222-222222222222", key: "delivered", label: "Delivered", color: "#397253", position: 20, is_closed: true },
];

const invoices: InvoiceOption[] = [{
  id: "44444444-4444-4444-8444-444444444444",
  invoice_number: "INV-204",
  client_id: "55555555-5555-4555-8555-555555555555",
  client_name: "Ravish Media",
  status: "sent",
  total_cents: 120000,
  issue_date: "2026-08-20",
}];

const job: JobRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Campaign shoot",
  job_number: "JOB-1",
  client_id: null,
  status_id: statuses[0].id,
  shoot_date: null,
  shoot_time: null,
  due_date: null,
  due_time: null,
  photos_delivered: 0,
  hours: 2,
  created_assets: 1,
  open_tasks: 1,
  value_cents: 50000,
  has_unset_task_hours: false,
  allocation_needs_hours: false,
  location: null,
  description: null,
  notes: null,
  updated_at: "2026-08-19T00:00:00.000Z",
  client: null,
  status: statuses[0],
  related_invoices: [],
};

describe("StatusGroupedTable", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    actionMocks.bulkUpdateJobStatus.mockClear();
    actionMocks.linkJobsToInvoice.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("selects a complete status group and applies one bulk status change", async () => {
    await act(async () => {
      root.render(<StatusGroupedTable kind="jobs" statuses={statuses} records={[job]} clients={[]} invoices={invoices} />);
    });

    const groupCheckbox = container.querySelector<HTMLInputElement>('[aria-label="Select all Planning jobs"]')!;
    await act(async () => groupCheckbox.click());

    expect(container.querySelector<HTMLInputElement>('[aria-label="Select Campaign shoot"]')?.checked).toBe(true);
    expect(container.textContent).toContain("1 selected");

    const select = container.querySelector<HTMLSelectElement>('[aria-label="New status for selected jobs"]')!;
    await act(async () => {
      select.value = statuses[1].id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const form = select.closest("form")!;
    await act(async () => form.requestSubmit());

    expect(actionMocks.bulkUpdateJobStatus).toHaveBeenCalledWith([job.id], statuses[1].id);
    expect(container.textContent).toContain("moved to Delivered");
  });

  it("searches for an invoice and links it to selected jobs", async () => {
    await act(async () => {
      root.render(<StatusGroupedTable kind="jobs" statuses={statuses} records={[job]} clients={[]} invoices={invoices} />);
    });

    await act(async () => container.querySelector<HTMLInputElement>('[aria-label="Select Campaign shoot"]')!.click());
    const search = container.querySelector<HTMLInputElement>('[aria-label="Search invoice for selected jobs"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Ravish");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const result = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((button) => button.textContent?.includes("INV-204"));
    expect(result).toBeTruthy();
    await act(async () => result!.click());
    const linkButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "Link");
    await act(async () => linkButton!.click());

    expect(actionMocks.linkJobsToInvoice).toHaveBeenCalledWith([job.id], invoices[0].id);
    expect(container.textContent).toContain("INV-204 linked to 1 job");
  });
});
