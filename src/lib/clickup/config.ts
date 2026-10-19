import "server-only";

export const CLICKUP_LIST_ID = "1300350000002054";
export const CLICKUP_LIST_NAME = "APG/Amotiv";

export const CLICKUP_STATUS_MAPPING = {
  planning: "TO DO",
  scheduled: "CONTENT CAPTURED",
  production: "EDITING",
  review: "APPROVAL",
  delivered: "COMPLETE",
} as const;

export function getClickUpToken() {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  return token || null;
}

export function getClickUpConfigurationSummary() {
  return {
    configured: Boolean(getClickUpToken()),
    listId: CLICKUP_LIST_ID,
    listName: CLICKUP_LIST_NAME,
  };
}
