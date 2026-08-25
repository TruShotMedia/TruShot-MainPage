import "server-only";

export type NotionConfiguration = {
  token: string;
  clientsSourceId: string | null;
  jobsSourceId: string;
  tasksSourceId: string;
  syncIntervalMinutes: number;
};

function syncIntervalMinutes() {
  const configured = Number(process.env.NOTION_SYNC_INTERVAL_MINUTES ?? 15);
  return Number.isFinite(configured) ? Math.min(1_440, Math.max(10, configured)) : 15;
}

function optionalSourceId(value: string | undefined) {
  const configured = value?.trim();
  return configured && !/^(null|none|void)$/i.test(configured) ? configured : null;
}

export function getNotionConfiguration(): NotionConfiguration | null {
  const token = process.env.NOTION_API_TOKEN?.trim();
  const clientsSourceId = optionalSourceId(process.env.NOTION_CLIENTS_DATA_SOURCE_ID);
  const jobsSourceId = process.env.NOTION_JOBS_DATA_SOURCE_ID?.trim();
  const tasksSourceId = process.env.NOTION_TASKS_DATA_SOURCE_ID?.trim();
  if (!token || !jobsSourceId || !tasksSourceId) return null;
  return { token, clientsSourceId, jobsSourceId, tasksSourceId, syncIntervalMinutes: syncIntervalMinutes() };
}

export function getNotionConfigurationSummary() {
  return {
    configured: Boolean(
      process.env.NOTION_API_TOKEN?.trim()
      && process.env.NOTION_JOBS_DATA_SOURCE_ID?.trim()
      && process.env.NOTION_TASKS_DATA_SOURCE_ID?.trim(),
    ),
    syncIntervalMinutes: syncIntervalMinutes(),
  };
}
