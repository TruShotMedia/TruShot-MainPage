import "server-only";
import { createHash,createHmac,timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ClickUpApiError,createClickUpWebhook,deleteClickUpWebhook,updateClickUpWebhook } from "./client";
import { encryptClickUpWebhookSecret,decryptClickUpWebhookSecret } from "./crypto";
import { PERSONAL_TEAM_ID,type PersonalConnection } from "./personal-model";
import { createServiceClient } from "@/lib/supabase/service";

// Separate endpoint: the legacy webhook registration's endpoint cleanup must
// never discover or delete another person's subscription.
export const PERSONAL_WEBHOOK_ENDPOINT="https://www.trushotmedia.com/api/integrations/clickup/personal-webhook";
const events=["taskCreated","taskUpdated","taskDeleted","taskStatusUpdated","taskDueDateUpdated","taskMoved","taskAssigneeUpdated"];
const table="website-clickup-personal-webhooks";
export async function ensurePersonalWebhook(service:SupabaseClient,connection:PersonalConnection) {
  const stored=await service.from(table).select("webhook_id,ciphertext,iv,tag").eq("connection_id",connection.id).maybeSingle();
  if(stored.error)throw new Error("Webhook status unavailable");
  if(stored.data) {
    try{await updateClickUpWebhook(stored.data.webhook_id,{endpoint:PERSONAL_WEBHOOK_ENDPOINT,events,status:"active"});return;}
    catch(error){if(!(error instanceof ClickUpApiError)||error.status!==404)throw error;const removed=await service.from(table).delete().eq("connection_id",connection.id).eq("webhook_id",stored.data.webhook_id);if(removed.error)throw new Error("Webhook status unavailable");}
  }
  // Check the encryption configuration before creating external state.
  encryptClickUpWebhookSecret("configuration-check");
  const {webhook}=await createClickUpWebhook(PERSONAL_TEAM_ID,{endpoint:PERSONAL_WEBHOOK_ENDPOINT,events,list_id:Number(connection.list_id)});
  if(!webhook.id||!webhook.secret)throw new Error("ClickUp did not confirm a signed webhook");
  const encrypted=encryptClickUpWebhookSecret(webhook.secret);
  const saved=await service.from(table).insert({connection_id:connection.id,webhook_id:webhook.id,...encrypted});
  if(saved.error){await deleteClickUpWebhook(webhook.id).catch(()=>undefined);throw new Error("Webhook identity could not be saved");}
}

export function personalSignatureValid(raw:string,signature:string,secret:string) {
  if(!/^[a-f0-9]{64}$/i.test(signature.trim()))return false;
  return timingSafeEqual(Buffer.from(signature.trim(),"hex"),createHmac("sha256",secret).update(raw).digest());
}
const payloadSchema=z.object({webhook_id:z.union([z.string(),z.number()]).transform(String),task_id:z.union([z.string(),z.number()]).transform(String),
  event:z.string().max(100),history_items:z.array(z.object({id:z.union([z.string(),z.number()]).transform(String).optional()}).passthrough()).optional()});
export async function recordPersonalWebhook(raw:string,signature:string|null) {
  if(!signature)return {status:401,connectionId:null};
  let input:unknown;try{input=JSON.parse(raw);}catch{return {status:400,connectionId:null};}
  const parsed=payloadSchema.safeParse(input);if(!parsed.success)return {status:400,connectionId:null};
  const service=createServiceClient();if(!service)return {status:503,connectionId:null};
  const hook=await service.from(table).select("connection_id,ciphertext,iv,tag").eq("webhook_id",parsed.data.webhook_id).maybeSingle();
  if(hook.error||!hook.data)return {status:401,connectionId:null};
  try{if(!personalSignatureValid(raw,signature,decryptClickUpWebhookSecret(hook.data)))return {status:401,connectionId:null};}catch{return {status:503,connectionId:null};}
  if(!events.includes(parsed.data.event))return {status:204,connectionId:null};
  const key=`${parsed.data.webhook_id}:${parsed.data.history_items?.find(item=>item.id)?.id??createHash("sha256").update(raw).digest("hex")}`;
  const queued=await service.rpc("website-queue-personal-inbound",{p_connection:hook.data.connection_id,p_remote:parsed.data.task_id,p_dedupe:key});
  return queued.error?{status:503,connectionId:null}:{status:204,connectionId:hook.data.connection_id as string};
}
