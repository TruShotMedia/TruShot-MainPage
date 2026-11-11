import {after} from "next/server";
import {recordPersonalWebhook} from "@/lib/clickup/personal-webhook";
import {dispatchPersonalClickUpSync} from "@/lib/clickup/personal-sync";
export const maxDuration=60;
export async function POST(request:Request) {
  if(Number(request.headers.get("content-length")??0)>262144)return new Response(null,{status:413});
  const body=await request.text();if(Buffer.byteLength(body)>262144)return new Response(null,{status:413});
  const result=await recordPersonalWebhook(body,request.headers.get("x-signature"));
  if(result.connectionId)after(async()=>{await dispatchPersonalClickUpSync(result.connectionId).catch(()=>console.error("Personal ClickUp webhook processing deferred."));});
  return new Response(null,{status:result.status});
}
