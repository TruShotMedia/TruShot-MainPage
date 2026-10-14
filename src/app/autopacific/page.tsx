import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TabletPipelineKiosk } from "@/components/tablet/tablet-pipeline-kiosk";
import { TABLET_REFRESH_INTERVAL_MINUTES } from "@/lib/config";
import { getAdminContext, getTabletKioskData } from "@/lib/data/admin";
import { todayDateInput } from "@/lib/format";
import { getNotionConfigurationSummary } from "@/lib/notion/config";
import { parseTabletView, TABLET_VIEW_COOKIE_NAME } from "@/lib/tablet-view";

const AUTOPACIFIC_CLIENT_NAME = "Autopacific Group";

export const metadata: Metadata = {
  title: "Autopacific Production",
  description: "TruShot Media's protected Autopacific Group production workspace.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07100b",
};

export default async function AutopacificPage() {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login?next=%2Fautopacific");

  const [data, cookieStore] = await Promise.all([
    getTabletKioskData({ clientName: AUTOPACIFIC_CLIENT_NAME }),
    cookies(),
  ]);
  const notion = getNotionConfigurationSummary();
  const pipelineVersion = data.pipelineTasks
    .map((task) => `${task.id}:${task.status_id}:${task.updated_at}`)
    .join("|");

  return (
    <TabletPipelineKiosk
      branding={{
        logoAlt: "Autopacific Group",
        logoHeight: 312,
        logoSrc: "/brand/autopacific-logo-clean.png",
        logoSurface: "light",
        logoWidth: 1800,
        name: "Autopacific Group",
        location: "Production",
      }}
      calendarJobs={data.calendarJobs}
      calendarTasks={data.calendarTasks}
      calendarCampaignAssets={data.calendarCampaignAssets}
      calendarEvents={data.calendarEvents}
      clientOptions={data.clientOptions}
      initialNow={new Date().toISOString()}
      initialStatuses={data.statuses}
      initialTasks={data.pipelineTasks}
      initialView={parseTabletView(cookieStore.get(TABLET_VIEW_COOKIE_NAME)?.value)}
      jobOptions={data.jobOptions}
      jobStatuses={data.jobStatuses}
      pipelineJobs={data.pipelineJobs}
      pendingRequestCount={data.pendingRequestCount}
      pipelineVersion={pipelineVersion}
      notionSyncEnabled={notion.configured}
      notionSyncIntervalMinutes={notion.syncIntervalMinutes}
      refreshIntervalMinutes={TABLET_REFRESH_INTERVAL_MINUTES}
      today={todayDateInput()}
    />
  );
}
