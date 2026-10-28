import type { TabletKioskData } from "@/lib/types";
import type { WorkspaceMode } from "@/lib/workspace-mode";

type CalendarData = Pick<TabletKioskData, "calendarJobs" | "calendarTasks" | "calendarCampaignAssets" | "calendarEvents" | "flightEvents">;

function isIngreign(item: { title: string; client_name: string | null }) {
  return /\bingreign\b/i.test(`${item.title} ${item.client_name ?? ""}`);
}

// This is a workspace display scope, not a new account-level permission boundary:
// Production and Marketing currently authenticate with the same account.
export function scopeCalendarForWorkspace<T extends CalendarData>(data: T, mode: WorkspaceMode): T {
  if (mode !== "marketing") return data;
  return {
    ...data,
    calendarJobs: data.calendarJobs.filter(item => !isIngreign(item)),
    calendarTasks: data.calendarTasks.filter(item => !isIngreign(item)),
    calendarCampaignAssets: data.calendarCampaignAssets.filter(item => !isIngreign(item)),
    calendarEvents: data.calendarEvents.filter(item => !isIngreign(item)),
    flightEvents: data.flightEvents.filter(item => !isIngreign(item)),
  };
}
