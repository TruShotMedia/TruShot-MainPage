import type { TabletView } from "@/lib/tablet-view";
export type WorkspaceMode = "production" | "marketing";
export function workspaceViews(_mode: WorkspaceMode, showToday: boolean, showCampaigns = false, showMap = false): TabletView[] {
  const campaigns: TabletView[] = showCampaigns ? ["campaigns"] : [];
  return ["jobs", "pipeline", ...campaigns, "calendar", ...(showToday ? ["today" as const] : []), ...(showMap ? ["map" as const] : [])];
}
export function workspaceInitialView(value: TabletView, mode: WorkspaceMode, showToday: boolean, showCampaigns = false, showMap = false): TabletView {
  return workspaceViews(mode, showToday, showCampaigns, showMap).includes(value) ? value : mode === "marketing" ? "jobs" : "pipeline";
}
