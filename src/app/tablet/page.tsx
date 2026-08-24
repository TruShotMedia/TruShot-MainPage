import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TabletPipelineKiosk } from "@/components/tablet/tablet-pipeline-kiosk";
import { TABLET_REFRESH_INTERVAL_MINUTES } from "@/lib/config";
import { getAdminContext, getTabletKioskData } from "@/lib/data/admin";
import { todayDateInput } from "@/lib/format";

export const metadata: Metadata = {
  title: "Tablet Pipeline",
  description: "TruShot Media's protected tablet production pipeline.",
  robots: { index: false, follow: false },
};

export default async function TabletPage() {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login?next=%2Ftablet");

  const data = await getTabletKioskData();
  const pipelineVersion = data.pipelineTasks
    .map((task) => `${task.id}:${task.status_id}:${task.updated_at}`)
    .join("|");
  return (
    <TabletPipelineKiosk
      calendarJobs={data.calendarJobs}
      calendarTasks={data.calendarTasks}
      initialNow={new Date().toISOString()}
      initialStatuses={data.statuses}
      initialTasks={data.pipelineTasks}
      pendingRequestCount={data.pendingRequestCount}
      pipelineVersion={pipelineVersion}
      refreshIntervalMinutes={TABLET_REFRESH_INTERVAL_MINUTES}
      today={todayDateInput()}
    />
  );
}
