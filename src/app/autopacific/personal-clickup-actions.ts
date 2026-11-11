"use server";

import { after } from "next/server";
import { z } from "zod";
import { getProductionContext } from "@/lib/data/admin";
import { getProductionTeam } from "@/lib/data/production-team";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { ClickUpApiError, getClickUpList, getClickUpSpaces, getClickUpTask, getClickUpWorkspaces } from "@/lib/clickup/client";
import { ownsPersonalMirror, parsePersonalListUrl, PERSONAL_JOB_STAGES, PERSONAL_TEAM_ID, personalRemoteHash, suggestedPersonalStatuses, type PersonalConnection, type PersonalConnectionView } from "@/lib/clickup/personal-model";
import { dispatchPersonalClickUpSync, PERSONAL_CONNECTIONS, PERSONAL_LINKS, PERSONAL_QUEUE } from "@/lib/clickup/personal-sync";
import {ensurePersonalWebhook} from "@/lib/clickup/personal-webhook";
import {getClickUpWebhookEncryptionKey} from "@/lib/clickup/config";

async function manager() {
  const context = await getProductionContext();
  if (!context) throw new Error("Sign in again to manage ClickUp connections.");
  const team = await getProductionTeam(context.supabase, context.claims.sub, context.access === "admin");
  const canManage=context.access==="admin"
    ? ["owner","admin"].includes(context.membership.role)||team.members.some(member=>member.user_id===context.claims.sub&&member.role==="manager")
    : team.canManage;
  if (!canManage) throw new Error("Only your team manager can manage ClickUp connections.");
  const service = createServiceClient();
  if (!service) throw new Error("The connection service is unavailable. Please retry.");
  return { ...context, service };
}
const targetSchema = z.object({ userId:z.uuid(), listUrl:z.string().trim().min(1).max(500) });

async function checkedDestination(input: z.infer<typeof targetSchema>, context: Awaited<ReturnType<typeof manager>>) {
  const parsed = parsePersonalListUrl(input.listUrl);
  const member = await context.service.from("website-production-team").select("is_active,is_primary_videographer")
    .eq("workspace_id",TRUSHOT_WORKSPACE_ID).eq("user_id",input.userId).maybeSingle();
  if (member.error || !member.data?.is_active) throw new Error("Enable this team member before connecting their list.");
  if (member.data.is_primary_videographer) throw new Error("John’s existing Jobs and Outlook connections are managed separately and will not be changed here.");
  const [jobs,outlook] = await Promise.all([
    context.service.from("website-clickup-integrations").select("list_id").eq("workspace_id",TRUSHOT_WORKSPACE_ID).maybeSingle(),
    context.service.from("website-clickup-outlook-bridge").select("list_id").eq("workspace_id",TRUSHOT_WORKSPACE_ID),
  ]);
  if (jobs.error || outlook.error) throw new Error("The reserved lists could not be verified. No changes were made.");
  if (jobs.data?.list_id === parsed.listId || outlook.data?.some(item => item.list_id === parsed.listId)) throw new Error("That destination is reserved for an existing connection.");
  let list, workspaces, spaces;
  try { [list,workspaces,spaces] = await Promise.all([getClickUpList(parsed.listId),getClickUpWorkspaces(),getClickUpSpaces(PERSONAL_TEAM_ID)]); }
  catch { throw new Error("This list could not be verified. Check the URL and that the existing ClickUp API account has access."); }
  if (String(list.id)!==parsed.listId || list.archived || !list.space?.id || !spaces.spaces.some(space=>String(space.id)===String(list.space!.id))) throw new Error("Choose an active list in the AutoPacific ClickUp workspace.");
  const workspace = workspaces.teams.find(item=>String(item.id)===PERSONAL_TEAM_ID);
  const people = (workspace?.members ?? []).map(item=>item.user).filter(person=>Number.isSafeInteger(person.id)&&person.id>0);
  if (!people.length) throw new Error("No assignable ClickUp workspace members were found.");
  const { data: directory,error } = await context.supabase.rpc("website-team-directory",{p_workspace:TRUSHOT_WORKSPACE_ID});
  if (error) throw new Error("The team account could not be verified.");
  const email = (directory as Array<{user_id:string;email:string}>).find(item=>item.user_id===input.userId)?.email?.trim().toLowerCase();
  const matches = people.filter(person=>email && person.email?.trim().toLowerCase()===email);
  return { ...parsed,listName:list.name,statuses:list.statuses ?? [],people:people.map(person=>({id:person.id,name:person.username,email:person.email ?? ""})),
    suggestedAssignee:matches.length===1?matches[0].id:null };
}

export async function inspectPersonalClickUpList(input:unknown) {
  const parsed = targetSchema.parse(input),context = await manager();
  const checked = await checkedDestination(parsed,context);
  return { ...checked, mapping:suggestedPersonalStatuses(checked.statuses) };
}

export async function loadPersonalClickUpConnections(): Promise<PersonalConnectionView[]> {
  const { service } = await manager();
  const { data,error } = await service.from(PERSONAL_CONNECTIONS).select("id,workspace_id,user_id,list_id,list_name,assigned_user_id,assigned_user_name,status_mapping,enabled,last_success_at,last_error")
    .eq("workspace_id",TRUSHOT_WORKSPACE_ID).order("updated_at",{ascending:false});
  if (error) throw new Error("Personal ClickUp connections could not be loaded.");
  return Promise.all((data ?? []).map(async connection=> {
    const [queue,issues,incoming] = await Promise.all([
      service.from(PERSONAL_QUEUE).select("record_id",{count:"exact",head:true}).eq("connection_id",connection.id),
      service.from(PERSONAL_LINKS).select("record_kind,record_id,record_title,last_error").eq("connection_id",connection.id).not("last_error","is",null).limit(50),
      service.from("website-clickup-personal-inbox").select("remote_id,last_error").eq("connection_id",connection.id).not("last_error","is",null).limit(50),
    ]);
    if (queue.error||issues.error||incoming.error) throw new Error("Sync status could not be loaded.");
    return { ...connection,pending:queue.count ?? 0,issues:issues.data ?? [],incoming:incoming.data??[] } as PersonalConnectionView;
  }));
}

export async function connectPersonalClickUpList(input:unknown) {
  const parsed = targetSchema.extend({ assignedUserId:z.number().int().positive(),mapping:z.record(z.string(),z.string().trim().min(1).max(100)) }).parse(input);
  const context = await manager();
  // Revalidate at Save; none of the inspection response is trusted on write.
  const checked = await checkedDestination(parsed,context);
  const assignee = checked.people.find(person=>person.id===parsed.assignedUserId);
  if (!assignee) throw new Error("Choose a verified ClickUp workspace member.");
  const mapping = Object.fromEntries(PERSONAL_JOB_STAGES.map(key=>[key,parsed.mapping[key]]));
  if(new Set(Object.values(mapping).map(value=>value?.toUpperCase())).size!==PERSONAL_JOB_STAGES.length)throw new Error("Choose a different ClickUp status for each job stage so incoming changes have an unambiguous meaning.");
  if(!getClickUpWebhookEncryptionKey())throw new Error("Signed two-way syncing is not configured on the server. No connection was changed.");
  if (PERSONAL_JOB_STAGES.some(key=>!checked.statuses.some(status=>status.status===mapping[key]))) throw new Error("Map every CRM stage to an available ClickUp status.");
  if (!checked.statuses.some(status=>status.status===mapping.delivered&&["closed","done"].includes(status.type ?? ""))) throw new Error("Completed work must map to a closed or done ClickUp status.");
  const { data,error } = await context.service.rpc("website-configure-personal-clickup",{p_workspace:TRUSHOT_WORKSPACE_ID,p_user:parsed.userId,p_list:checked.listId,p_name:checked.listName,
    p_assignee:assignee.id,p_assignee_name:assignee.name,p_mapping:mapping,p_enabled:true});
  if (error) throw new Error(error.message.includes("Sync is finishing")?"Sync is finishing. Try again shortly.":"This list is reserved, already connected to someone else, or could not be saved. No existing connections were changed.");
  const connection=await context.service.from(PERSONAL_CONNECTIONS).select("*").eq("workspace_id",TRUSHOT_WORKSPACE_ID).eq("id",String(data)).single();
  try{
    if(connection.error||!connection.data)throw new Error("Connection unavailable");
    await ensurePersonalWebhook(context.service,connection.data as PersonalConnection);
    const ready=await context.service.from(PERSONAL_CONNECTIONS).update({ready:true}).eq("workspace_id",TRUSHOT_WORKSPACE_ID).eq("id",String(data));
    if(ready.error)throw new Error("Connection could not be activated");
  }catch{
    await context.service.rpc("website-configure-personal-clickup",{p_workspace:TRUSHOT_WORKSPACE_ID,p_user:parsed.userId,p_list:null,p_name:null,p_assignee:null,p_assignee_name:null,p_mapping:null,p_enabled:false});
    throw new Error("The personal connection was saved but paused because signed incoming updates could not be enabled. Retry connecting the list. John’s connections are unchanged.");
  }
  after(()=>dispatchPersonalClickUpSync(String(data)).catch(()=>({status:"pending"})));
  return {ok:true};
}

export async function pausePersonalClickUpList(input:unknown) {
  const userId=z.uuid().parse(input),{service}=await manager();
  const {error}=await service.rpc("website-configure-personal-clickup",{p_workspace:TRUSHOT_WORKSPACE_ID,p_user:userId,p_list:null,p_name:null,p_assignee:null,p_assignee_name:null,p_mapping:null,p_enabled:false});
  if(error)throw new Error("The connection could not be paused. A sync may be finishing; try again shortly.");
  return {ok:true};
}

export async function retryPersonalClickUpItem(input:unknown) {
  const parsed=z.object({connectionId:z.uuid(),recordKind:z.enum(["job","task"]),recordId:z.uuid(),useCrm:z.boolean(),useClickUp:z.boolean().default(false)}).parse(input);
  if(parsed.useCrm&&parsed.useClickUp)throw new Error("Choose one version to keep.");
  const {service}=await manager();
  const connection=await service.from(PERSONAL_CONNECTIONS).select("*").eq("workspace_id",TRUSHOT_WORKSPACE_ID).eq("id",parsed.connectionId).eq("enabled",true).single();
  if(connection.error||!connection.data)throw new Error("Resume this connection before retrying.");
  const found=await service.from(PERSONAL_LINKS).select("*").eq("connection_id",parsed.connectionId).eq("record_kind",parsed.recordKind).eq("record_id",parsed.recordId).single();
  if(found.error||!found.data)throw new Error("This mirror could not be found.");
  let overwrite:string|null=null;
  if(parsed.useCrm||parsed.useClickUp) {
    if(!found.data.clickup_task_id)throw new Error("An unconfirmed create must be checked in ClickUp first. Retry checks for it without creating a duplicate.");
    try {
      const remote=await getClickUpTask(found.data.clickup_task_id);
      if(!ownsPersonalMirror(remote,connection.data as PersonalConnection,parsed.recordKind,parsed.recordId,found.data.generation))throw new Error("Identity changed");
      overwrite=personalRemoteHash(remote);
    }catch(error){if(parsed.useCrm&&error instanceof ClickUpApiError&&error.status===404)overwrite="missing";else throw new Error("The mirror identity could not be verified. Nothing was overwritten.");}
  }
  const result=await service.rpc("website-retry-personal-clickup",{p_connection:parsed.connectionId,p_kind:parsed.recordKind,p_record:parsed.recordId,p_remote:found.data.clickup_task_id,p_generation:found.data.generation,p_overwrite:parsed.useClickUp?null:overwrite,p_accept:parsed.useClickUp?overwrite:null});
  if(result.error)throw new Error("The sync changed while you were reviewing it. Refresh this panel and try again.");
  after(()=>dispatchPersonalClickUpSync(parsed.connectionId).catch(()=>({status:"pending"})));
  return {ok:true};
}

export async function syncPersonalClickUpNow(input:unknown) {
  const id=z.uuid().parse(input),{service}=await manager();
  const found=await service.from(PERSONAL_CONNECTIONS).select("id").eq("workspace_id",TRUSHOT_WORKSPACE_ID).eq("id",id).single();
  if(found.error)throw new Error("This connection could not be found.");
  const result=await service.rpc("website-request-personal-reconcile",{p_connection:id});
  if(result.error)throw new Error("Resume this connection first, or wait for its current sync to finish.");
  after(async()=>{await dispatchPersonalClickUpSync(id).catch(()=>undefined);});
  return {ok:true};
}
