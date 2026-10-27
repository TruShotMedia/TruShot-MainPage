import type { TabletView } from "@/lib/tablet-view";
export type WorkspaceMode = "production" | "marketing";
export function workspaceViews(mode: WorkspaceMode, showToday: boolean): TabletView[] {
  return mode === "marketing" ? ["jobs", "planning", "calendar"] : ["jobs", "pipeline", "calendar", ...(showToday ? ["today" as const] : [])];
}
export function workspaceInitialView(value: TabletView, mode: WorkspaceMode, showToday: boolean): TabletView {
  return workspaceViews(mode, showToday).includes(value) ? value : mode === "marketing" ? "planning" : "pipeline";
}
