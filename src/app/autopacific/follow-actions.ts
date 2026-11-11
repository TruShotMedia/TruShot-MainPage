"use server";
import { z } from "zod";
import { getProductionContext } from "@/lib/data/admin";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";

const recordSchema=z.object({recordKind:z.enum(["job","task"]),recordId:z.uuid()});
export async function loadWorkRecordFollowing(input:unknown) {
  const record=recordSchema.parse(input);
  const context=await getProductionContext();
  if(!context)throw new Error("Sign in again to manage updates.");
  const {data,error}=await context.supabase.from("website-work-record-followers").select("is_following")
    .eq("workspace_id",TRUSHOT_WORKSPACE_ID).eq("record_kind",record.recordKind).eq("record_id",record.recordId).eq("user_id",context.claims.sub).maybeSingle();
  if(error)throw new Error("Your update preference could not be loaded.");
  return {following:data?.is_following===true};
}
export async function setWorkRecordFollowing(input:unknown) {
  const record=recordSchema.extend({following:z.boolean()}).parse(input);
  const context=await getProductionContext();
  if(!context)throw new Error("Sign in again to manage updates.");
  const {data,error}=await context.supabase.rpc("website-set-work-record-following",{
    p_workspace:TRUSHOT_WORKSPACE_ID,p_kind:record.recordKind,p_record:record.recordId,p_following:record.following,
  });
  if(error||data!==record.following)throw new Error("Your update preference could not be saved. Please retry.");
  return {following:data===true};
}
