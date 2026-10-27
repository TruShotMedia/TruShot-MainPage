import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductionContext } from "@/lib/data/admin";
import { JOB_ATTACHMENT_BUCKET } from "@/lib/job-brief";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
export async function GET(request:Request,{params}:{params:Promise<{jobId:string;attachmentId:string}>}){
  const ids=await params;
  if(!z.uuid().safeParse(ids.jobId).success||!z.uuid().safeParse(ids.attachmentId).success)return new Response("Not found",{status:404});
  const context=await getProductionContext();
  if(!context)return NextResponse.redirect(new URL(`/autopacific/login?next=${encodeURIComponent(`/autopacific?job=${ids.jobId}`)}`,request.url));
  const {data,error}=await context.supabase.from("website-job-attachments").select("storage_path").eq("id",ids.attachmentId).eq("job_id",ids.jobId).eq("workspace_id",TRUSHOT_WORKSPACE_ID).is("archived_at",null).maybeSingle();
  if(error||!data)return new Response("This attachment is unavailable.",{status:404});
  const {data:signed,error:signingError}=await context.supabase.storage.from(JOB_ATTACHMENT_BUCKET).createSignedUrl(data.storage_path,60);
  if(signingError||!signed)return new Response("Private file access is temporarily unavailable.",{status:503});
  const response=NextResponse.redirect(signed.signedUrl);response.headers.set("Cache-Control","private, no-store");return response;
}
