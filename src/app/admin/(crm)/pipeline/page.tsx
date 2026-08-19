import { PageHeader } from "@/components/admin/page-header";
import { PipelineBoard } from "@/components/admin/pipeline-board";
import { getPipeline } from "@/lib/data/admin";
import type { PipelineTask, TaskStatus } from "@/lib/types";

export default async function PipelinePage() {
  const data = await getPipeline();
  return (
    <>
      <PageHeader eyebrow="Production flow" title="Asset pipeline" description="Every task represents a created asset. Move work from not started through review to ready and done." />
      <PipelineBoard initialStatuses={data.statuses as TaskStatus[]} initialTasks={data.tasks as PipelineTask[]} />
    </>
  );
}
