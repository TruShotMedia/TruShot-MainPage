import type { TabletView } from "@/lib/tablet-view";
import type { WorkspaceMode } from "@/lib/workspace-mode";

export const autopacificApplicationNames = {
  production: "AutoPacific Production",
  marketing: "AutoPacific Marketing",
} as const;

export function autopacificBrowserIcons(mode: WorkspaceMode) {
  const png = `/autopacific/icons/32?surface=${mode}&v=1`;
  return {
    icon: [
      { url: png, sizes: "32x32", type: "image/png" },
      { url: `/brand/autopacific-${mode}-favicon.svg?v=1`, sizes: "any", type: "image/svg+xml" },
    ],
    shortcut: [{ url: png, type: "image/png" }],
    // Keep the existing installed-app branding separate from browser-tab icons.
    apple: [{ url: "/autopacific/icons/180", sizes: "180x180", type: "image/png" }],
  };
}

const viewNames: Record<TabletView, string> = {
  jobs: "Jobs",
  planning: "Planning",
  pipeline: "Tasks",
  calendar: "Calendar",
  today: "Today",
};

export function autopacificTabTitle(mode: WorkspaceMode, view: TabletView, jobView?: "active" | "planning" | "completed") {
  const section = view === "jobs" && jobView === "planning"
    ? "Planning"
    : view === "jobs" && jobView === "completed"
      ? "Completed jobs"
      : viewNames[view];
  return `${section} | ${autopacificApplicationNames[mode]}`;
}
