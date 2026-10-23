import { after } from "next/server";
import { dispatchClickUpInboundSync } from "@/lib/clickup/inbound-sync";
import { recordClickUpWebhook } from "@/lib/clickup/webhook-receiver";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) return new Response("Payload too large.", { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return new Response("Payload too large.", { status: 413 });
  const result = await recordClickUpWebhook(rawBody, request.headers.get("x-signature"));
  if (!result.accepted) return new Response(result.message, { status: result.status });
  after(() => dispatchClickUpInboundSync({ limit: 20 }).catch((error) => {
    console.error("ClickUp inbound processing failed after the webhook response.", error);
  }));
  return new Response(null, { status: 204 });
}
