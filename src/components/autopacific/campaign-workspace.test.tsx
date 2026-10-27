// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignPlanner, CampaignWorkspace } from "./campaign-workspace";
import type { CampaignPlan } from "@/lib/production-campaigns";

const actions = vi.hoisted(() => ({ loadProductionCampaigns: vi.fn(), saveProductionCampaign: vi.fn(), archiveProductionCampaign: vi.fn(), createDeliverableTasks: vi.fn() }));
vi.mock("@/app/autopacific/campaign-actions", () => actions);
vi.mock("@/app/admin/actions", () => actions);
const statuses = ["planning", "scheduled", "production", "review", "delivered", "delayed"].map((key, i) => ({ id: key, key, label: key, color: "#579", position: i, is_closed: i > 3 }));
const plan: CampaignPlan = { id: "campaign", title: "RAT Run campaign", objective: "Release the series", notes: null, start_date: "2026-12-30", updated_at: "2026-10-28T00:00:00Z", weeks: [{ id: "week", title: "Teaser", jobs: [{ id: "job", title: "Episode 1", status_id: "planning", shoot_date: null, due_date: "2027-01-02", description: null, location: null, updated_at: "2026-10-28T00:00:00Z", deliverables: [{ id: "item", name: "Preview reel", date: null }], tasks: [] }] }] };
describe("Campaign weekly editor", () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks(); actions.loadProductionCampaigns.mockResolvedValue([plan]);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  function planner(extra = {}) { return <CampaignPlanner initial={plan} statuses={statuses} editable marketing={false} busy={false} error="" onClose={vi.fn()} onSave={vi.fn()} onArchive={vi.fn()} onReload={vi.fn()} {...extra} />; }
  it("adds weeks with a job, computes year-crossing dates and enforces the minimum", async () => {
    await act(async () => root.render(planner()));
    expect(container.textContent).toContain("30 Dec 2026 — 5 Jan 2027");
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Remove week 1"]')?.disabled).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>(".campaign-add-week")!.click());
    expect(container.querySelectorAll(".campaign-week")).toHaveLength(2);
    expect(container.querySelectorAll(".campaign-plan-job")).toHaveLength(2);
    expect(container.textContent).toContain("6 Jan 2027 — 12 Jan 2027");
    expect(container.querySelector<HTMLButtonElement>(".campaign-task-action button")?.disabled).toBe(true);
  });
  it("lets Marketing plan deliverables without creating or editing tasks", async () => {
    await act(async () => root.render(planner({ marketing: true })));
    expect(container.querySelector(".campaign-deliverable input")).not.toBeNull();
    expect(container.querySelector(".campaign-task-action")).toBeNull();
  });
  it("provides a read-only view while kiosk editing is off", async () => {
    await act(async () => root.render(planner({ editable: false })));
    expect(container.querySelector("input,textarea,select,.campaign-add-week,.campaign-add-job")).toBeNull();
    expect(container.textContent).toContain("Episode 1");
  });
  it("shows already-linked tasks instead of offering duplicate generation", async () => {
    const linked: CampaignPlan = { ...plan, weeks: [{ ...plan.weeks[0], jobs: [{ ...plan.weeks[0].jobs[0], tasks: [{ id: "task", title: "Preview reel", source_deliverable_id: "item", completed_at: null }] }] }] };
    await act(async () => root.render(planner({ initial: linked })));
    expect(container.textContent).toContain("All 1 deliverables have linked tasks");
    expect(container.querySelector(".campaign-task-action button")).toBeNull();
  });
  it("puts planning campaigns in Planning rather than manually moving the campaign", async () => {
    await act(async () => { root.render(<CampaignWorkspace statuses={statuses} />); await new Promise(resolve => setTimeout(resolve, 20)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.querySelector(".campaign-card")).toBeNull();
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.startsWith("Planning"))!.click());
    expect(container.querySelector(".campaign-card h3")?.textContent).toBe(plan.title);
    expect(container.querySelector(".drag-handle")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>(".campaign-card")!.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
