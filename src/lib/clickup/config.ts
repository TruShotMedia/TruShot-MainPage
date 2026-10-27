import "server-only";

export const CLICKUP_LIST_ID = "1300350000002054";
export const CLICKUP_LIST_NAME = "Jobs";
export const CLICKUP_FOLDER_NAME = "Content & Planning";
export const CLICKUP_TEAM_ID = "9003084068";
export const CLICKUP_WEBHOOK_ENDPOINT = "https://www.trushotmedia.com/api/integrations/clickup/webhook";

export const CLICKUP_STATUS_MAPPING = {
  planning: "PLANNING",
  // Rescheduled CRM work is an actionable successor. It must arrive in
  // ClickUp as a fresh To Do rather than looking already captured.
  scheduled: "SCHEDULED",
  production: "EDITING",
  review: "APPROVAL",
  delayed: "DELAYED",
  delivered: "COMPLETE",
} as const;

export function getClickUpToken() {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  return token || null;
}

export function getClickUpWebhookEncryptionKey() {
  const key = process.env.CLICKUP_WEBHOOK_ENCRYPTION_KEY?.trim();
  return key || null;
}

export function getClickUpConfigurationSummary() {
  return {
    configured: Boolean(getClickUpToken()),
    webhookEncryptionConfigured: Boolean(getClickUpWebhookEncryptionKey()),
    listId: CLICKUP_LIST_ID,
    listName: CLICKUP_LIST_NAME,
  };
}
