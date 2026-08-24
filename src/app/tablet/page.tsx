import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TabletPipelineKiosk } from "@/components/tablet/tablet-pipeline-kiosk";
import { getAdminContext, getPipeline } from "@/lib/data/admin";
import { todayDateInput } from "@/lib/format";
import type { PipelineTask, TaskStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Tablet Pipeline",
  description: "TruShot Media's protected tablet production pipeline.",
  robots: { index: false, follow: false },
};

export default async function TabletPage() {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login?next=%2Ftablet");

  const pipeline = await getPipeline();
  const pipelineVersion = pipeline.tasks
    .map((task) => `${task.id}:${task.status_id}:${task.updated_at}`)
    .join("|");
  return (
    <TabletPipelineKiosk
      key={pipelineVersion}
      displayName={context.membership.display_name?.split(" ")[0] || "TruShot"}
      initialNow={new Date().toISOString()}
      initialStatuses={pipeline.statuses as TaskStatus[]}
      initialTasks={pipeline.tasks as PipelineTask[]}
      today={todayDateInput()}
    />
  );
}
