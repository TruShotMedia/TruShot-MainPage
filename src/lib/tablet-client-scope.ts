import type { TabletKioskData } from "@/lib/types";

function normalizeClientName(value: string) {
  return value.trim().toLocaleLowerCase("en-AU");
}

export function scopeTabletKioskDataByClient(
  data: TabletKioskData,
  clientName: string,
  options: { includeOtherCalendarItems?: boolean } = {},
): TabletKioskData {
  const normalizedClientName = normalizeClientName(clientName);
  const client = data.clientOptions.find((option) => normalizeClientName(option.name) === normalizedClientName);
  const jobIds = new Set(
    data.pipelineJobs
      .filter((job) => job.client_id === client?.id)
      .map((job) => job.id),
  );
  const taskIds = new Set(
    data.pipelineTasks
      .filter((task) => jobIds.has(task.job_id))
      .map((task) => task.id),
  );

  return {
    ...data,
    clientOptions: client ? [client] : [],
    jobOptions: data.jobOptions.filter((job) => jobIds.has(job.id)),
    pipelineJobs: data.pipelineJobs.filter((job) => jobIds.has(job.id)),
    pipelineTasks: data.pipelineTasks.filter((task) => taskIds.has(task.id)),
    calendarJobs: options.includeOtherCalendarItems
      ? data.calendarJobs
      : data.calendarJobs.filter((job) => jobIds.has(job.id)),
    calendarTasks: options.includeOtherCalendarItems
      ? data.calendarTasks
      : data.calendarTasks.filter((task) => taskIds.has(task.id)),
    calendarCampaignAssets: options.includeOtherCalendarItems
      ? data.calendarCampaignAssets
      : data.calendarCampaignAssets.filter(
        (asset) => normalizeClientName(asset.client_name ?? "") === normalizedClientName,
      ),
  };
}
