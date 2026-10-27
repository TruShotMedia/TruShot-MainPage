import type { TabletView } from "@/lib/tablet-view";
export type WorkspaceMode = "production" | "marketing";
export function workspaceViews(_mode: WorkspaceMode, showToday: boolean, showCampaigns = false): TabletView[] {
  const campaigns: TabletView[] = showCampaigns ? ["campaigns"] : [];
  return ["jobs", "pipeline", ...campaigns, "calendar", ...(showToday ? ["today" as const] : [])];
}
export function workspaceInitialView(value: TabletView, mode: WorkspaceMode, showToday: boolean, showCampaigns = false): TabletView {
  return workspaceViews(mode, showToday, showCampaigns).includes(value) ? value : mode === "marketing" ? "jobs" : "pipeline";
}
