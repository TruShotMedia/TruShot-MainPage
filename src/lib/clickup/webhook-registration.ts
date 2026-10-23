import "server-only";

import {
  CLICKUP_LIST_ID,
  CLICKUP_TEAM_ID,
  CLICKUP_WEBHOOK_ENDPOINT,
} from "@/lib/clickup/config";
import {
  ClickUpApiError,
  createClickUpWebhook,
  deleteClickUpWebhook,
  getClickUpWebhooks,
  updateClickUpWebhook,
} from "@/lib/clickup/client";
import { encryptClickUpWebhookSecret } from "@/lib/clickup/crypto";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";

export const CLICKUP_WEBHOOK_EVENTS = [
  "taskCreated",
  "taskUpdated",
  "taskDeleted",
  "taskStatusUpdated",
  "taskDueDateUpdated",
  "taskMoved",
  "taskAssigneeUpdated",
] as const;

export async function ensureClickUpWebhook() {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("The server database connection is unavailable.");
  const { data: integration, error } = await supabase
    .from("website-clickup-integrations")
    .select("webhook_id,webhook_secret_ciphertext,webhook_secret_iv,webhook_secret_tag")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .single();
  if (error || !integration) throw new Error(error?.message ?? "The ClickUp integration is unavailable.");

  const hasStoredSecret = Boolean(
    integration.webhook_secret_ciphertext
    && integration.webhook_secret_iv
    && integration.webhook_secret_tag,
  );
  if (integration.webhook_id && hasStoredSecret) {
    try {
      const { webhook } = await updateClickUpWebhook(integration.webhook_id, {
        endpoint: CLICKUP_WEBHOOK_ENDPOINT,
        events: CLICKUP_WEBHOOK_EVENTS,
        status: "active",
      });
      await supabase.from("website-clickup-integrations").update({
        webhook_health: webhook.health?.status ?? "active",
        webhook_fail_count: webhook.health?.fail_count ?? 0,
      }).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
      return { webhookId: integration.webhook_id, reused: true };
    } catch (updateError) {
      if (!(updateError instanceof ClickUpApiError) || updateError.status !== 404) throw updateError;
    }
  }

  const { webhooks } = await getClickUpWebhooks(CLICKUP_TEAM_ID);
  const stale = webhooks.filter((webhook) => webhook.endpoint === CLICKUP_WEBHOOK_ENDPOINT);
  await Promise.all(stale.map((webhook) => deleteClickUpWebhook(webhook.id).catch(() => undefined)));

  const { webhook } = await createClickUpWebhook(CLICKUP_TEAM_ID, {
    endpoint: CLICKUP_WEBHOOK_ENDPOINT,
    events: CLICKUP_WEBHOOK_EVENTS,
    list_id: Number(CLICKUP_LIST_ID),
  });
  if (!webhook.id || !webhook.secret) throw new Error("ClickUp created a webhook without returning its verification secret.");
  const encrypted = encryptClickUpWebhookSecret(webhook.secret);
  const { error: saveError } = await supabase.from("website-clickup-integrations").update({
    webhook_id: webhook.id,
    webhook_secret_ciphertext: encrypted.ciphertext,
    webhook_secret_iv: encrypted.iv,
    webhook_secret_tag: encrypted.tag,
    webhook_health: webhook.health?.status ?? "active",
    webhook_fail_count: webhook.health?.fail_count ?? 0,
    inbound_mode: "observe",
    last_error: null,
  }).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  if (saveError) {
    await deleteClickUpWebhook(webhook.id).catch(() => undefined);
    throw saveError;
  }
  return { webhookId: webhook.id, reused: false };
}
