import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TabletPipelineKiosk } from "@/components/tablet/tablet-pipeline-kiosk";
import { TABLET_REFRESH_INTERVAL_MINUTES } from "@/lib/config";
import { getAdminContext, getTabletKioskData } from "@/lib/data/admin";
import { todayDateInput } from "@/lib/format";
import { getNotionConfigurationSummary } from "@/lib/notion/config";
import { parseTabletView, TABLET_VIEW_COOKIE_NAME } from "@/lib/tablet-view";

export const metadata: Metadata = {
  title: "Tablet Pipeline",
  description: "TruShot Media's protected tablet production pipeline.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07100b",
};

export default async function TabletPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login?next=%2Ftablet");

  const [data, cookieStore, query] = await Promise.all([getTabletKioskData(), cookies(), searchParams]);
  const requestedView = typeof query.view === "string" ? query.view : undefined;
  const notion = getNotionConfigurationSummary();
  const pipelineVersion = data.pipelineTasks
    .map((task) => `${task.id}:${task.status_id}:${task.updated_at}`)
    .join("|");
  return (
    <TabletPipelineKiosk
      branding={{
        calendarAccentColor: "#1f5e41",
        calendarCompletedColor: "#3f9b68",
        calendarMutedColor: "#687177",
        calendarOverdueColor: "#c5524a",
        logoAlt: "TruShot Media",
        logoHeight: 744,
        logoSrc: "/brand/logo-white.png",
        logoWidth: 2000,
        name: "TruShot Media",
        location: "Brisbane",
      }}
      calendarJobs={data.calendarJobs}
      calendarTasks={data.calendarTasks}
      calendarCampaignAssets={data.calendarCampaignAssets}
      calendarEvents={data.calendarEvents}
      calendarDensity="capacity"
      flightEvents={data.flightEvents}
      clientOptions={data.clientOptions}
      initialNow={new Date().toISOString()}
      initialStatuses={data.statuses}
      initialTasks={data.pipelineTasks}
      initialView={parseTabletView(requestedView ?? cookieStore.get(TABLET_VIEW_COOKIE_NAME)?.value)}
      jobOptions={data.jobOptions}
      jobStatuses={data.jobStatuses}
      pipelineJobs={data.pipelineJobs}
      pendingRequestCount={data.pendingRequestCount}
      pipelineVersion={pipelineVersion}
      notionSyncEnabled={notion.configured}
      notionSyncIntervalMinutes={notion.syncIntervalMinutes}
      notificationPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      refreshIntervalMinutes={TABLET_REFRESH_INTERVAL_MINUTES}
      today={todayDateInput()}
    />
  );
}
