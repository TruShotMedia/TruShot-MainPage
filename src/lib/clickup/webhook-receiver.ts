import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { decryptClickUpWebhookSecret } from "@/lib/clickup/crypto";
import { createServiceClient } from "@/lib/supabase/service";

const webhookPayloadSchema = z.object({
  webhook_id: z.union([z.string(), z.number()]).transform(String),
  event: z.string().min(1).max(100),
  task_id: z.union([z.string(), z.number()]).transform(String),
  history_items: z.array(z.object({
    id: z.union([z.string(), z.number()]).transform(String).optional(),
  }).passthrough()).optional(),
}).passthrough();

function validSignature(rawBody: string, supplied: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const suppliedBytes = Buffer.from(supplied.trim(), "hex");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function recordClickUpWebhook(rawBody: string, signature: string | null) {
  if (!signature) return { accepted: false as const, status: 401, message: "Missing ClickUp signature." };
  let untrusted: unknown;
  try {
    untrusted = JSON.parse(rawBody);
  } catch {
    return { accepted: false as const, status: 400, message: "Invalid JSON." };
  }
  const parsed = webhookPayloadSchema.safeParse(untrusted);
  if (!parsed.success) return { accepted: false as const, status: 400, message: "Invalid ClickUp payload." };

  const supabase = createServiceClient();
  if (!supabase) return { accepted: false as const, status: 503, message: "Database unavailable." };
  const { data: integration, error } = await supabase
    .from("website-clickup-integrations")
    .select("workspace_id,webhook_secret_ciphertext,webhook_secret_iv,webhook_secret_tag")
    .eq("webhook_id", parsed.data.webhook_id)
    .maybeSingle();
  if (error || !integration) return { accepted: false as const, status: 401, message: "Unknown ClickUp webhook." };
  if (!integration.webhook_secret_ciphertext || !integration.webhook_secret_iv || !integration.webhook_secret_tag) {
    return { accepted: false as const, status: 503, message: "Webhook verification is not configured." };
  }

  let secret: string;
  try {
    secret = decryptClickUpWebhookSecret({
      ciphertext: integration.webhook_secret_ciphertext,
      iv: integration.webhook_secret_iv,
      tag: integration.webhook_secret_tag,
    });
  } catch {
    return { accepted: false as const, status: 503, message: "Webhook verification is unavailable." };
  }
  if (!validSignature(rawBody, signature, secret)) {
    return { accepted: false as const, status: 401, message: "Invalid ClickUp signature." };
  }

  const historyId = parsed.data.history_items?.find((item) => item.id)?.id;
  const fallback = createHash("sha256").update(rawBody).digest("hex");
  const dedupeKey = historyId
    ? `${parsed.data.webhook_id}:${historyId}`
    : `${parsed.data.webhook_id}:${parsed.data.event}:${parsed.data.task_id}:${fallback}`;
  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("website-clickup-webhook-events").upsert({
    workspace_id: integration.workspace_id,
    webhook_id: parsed.data.webhook_id,
    dedupe_key: dedupeKey,
    clickup_task_id: parsed.data.task_id,
    event_type: parsed.data.event,
    payload: parsed.data,
    status: "pending",
    attempts: 0,
    available_at: now,
  }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (insertError) return { accepted: false as const, status: 503, message: "Webhook event could not be queued." };
  await supabase.from("website-clickup-integrations").update({
    last_webhook_received_at: now,
    webhook_health: "active",
    webhook_fail_count: 0,
  }).eq("workspace_id", integration.workspace_id);
  return { accepted: true as const, status: 202, message: "Accepted." };
}
