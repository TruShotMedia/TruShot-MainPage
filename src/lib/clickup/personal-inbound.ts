import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ClickUpApiError,getClickUpTask,getClickUpTasks,type ClickUpTask} from "./client";
import {containsCrmIdentity,decidePersonalInbound,ownsPersonalMirror,personalOwnedHash,personalRemoteHash,personalSharedState,type PersonalConnection,type PersonalKind} from "./personal-model";
import type {PersonalLink} from "./personal-sync-core";
import {sharedStateFromCrm} from "./shared-state";

const connections="website-clickup-personal-connections",links="website-clickup-personal-links",inbox="website-clickup-personal-inbox";
type PollConnection=PersonalConnection&{last_polled_at:string|null;next_poll_at:string;scan_started_at:string|null;scan_page:number};
function mappedStage(connection:PersonalConnection,status:string) {
  const matches=Object.entries(connection.status_mapping).filter(([,value])=>value.trim().toUpperCase()===status.trim().toUpperCase());
  if(matches.length!==1)throw new Error("A ClickUp stage is unmapped or ambiguous. Check status mapping in Manage team.");
  return matches[0][0];
}
function taskStage(key:string,jobKey:string) {return key==="posted_done"?"delivered":key==="delayed"?"delayed":key==="not_started"?(jobKey==="planning"?"planning":"scheduled"):key==="in_progress"?"production":"review";}

async function currentRecord(service:SupabaseClient,connection:PersonalConnection,link:PersonalLink) {
  if(link.record_kind==="job") {
    const result=await service.from("website-jobs").select("id,title,shoot_date,shoot_time,due_date,due_time,updated_at,archived_at,client_id,assignee_ids,status_id")
      .eq("workspace_id",connection.workspace_id).eq("id",link.record_id).maybeSingle();
    if(result.error)throw new Error("CRM record unavailable");
    const row=result.data;if(!row||row.archived_at||!row.assignee_ids.includes(connection.user_id))return null;
    const stage=await service.from("website-job-statuses").select("key").eq("workspace_id",connection.workspace_id).eq("id",row.status_id).single();
    if(stage.error)throw new Error("CRM stage unavailable");const status=String(stage.data.key);
    const count=await service.from("website-job-tasks").select("id",{count:"exact",head:true}).eq("workspace_id",connection.workspace_id).eq("job_id",row.id).is("archived_at",null);
    if(count.error)throw new Error("CRM progress unavailable");
    return {updated:row.updated_at,parent:null,parentUpdated:null,derived:Boolean(count.count),statusKey:status,shared:sharedStateFromCrm(row,connection.status_mapping[status]??"")};
  }
  const task=await service.from("website-job-tasks").select("id,job_id,title,due_date,due_time,due_date_is_override,updated_at,archived_at,assignee_ids,status_id")
    .eq("workspace_id",connection.workspace_id).eq("id",link.record_id).maybeSingle();
  if(task.error)throw new Error("CRM asset unavailable");
  if(!task.data||task.data.archived_at||!task.data.assignee_ids.includes(connection.user_id))return null;
  const job=await service.from("website-jobs").select("id,due_date,due_time,updated_at,archived_at,status_id")
    .eq("workspace_id",connection.workspace_id).eq("id",task.data.job_id).single();
  if(job.error)throw new Error("CRM parent unavailable");if(job.data.archived_at)return null;
  const [assetStage,parentStage]=await Promise.all([
    service.from("website-task-statuses").select("key").eq("workspace_id",connection.workspace_id).eq("id",task.data.status_id).single(),
    service.from("website-job-statuses").select("key").eq("workspace_id",connection.workspace_id).eq("id",job.data.status_id).single(),
  ]);
  if(assetStage.error||parentStage.error)throw new Error("CRM stages unavailable");
  const row=task.data,key=String(assetStage.data.key),jobKey=String(parentStage.data.key);
  const due=row.due_date_is_override?row.due_date:row.due_date??job.data.due_date;
  return {updated:row.updated_at,parent:row.job_id,parentUpdated:job.data.updated_at,derived:false,statusKey:key,
    shared:sharedStateFromCrm({title:row.title,shoot_date:null,shoot_time:null,due_date:due,due_time:row.due_time??(due===job.data.due_date?job.data.due_time:null)},connection.status_mapping[taskStage(key,jobKey)]??"")};
}

/** Periodic reconciliation supplements signed webhooks. A persistent cursor
 * and scan watermark bound large lists; a small overlap covers page movement.
 * Missing/deleted linked mirrors are also checked with a rolling sweep. */
export async function pollPersonalList(service:SupabaseClient,connection:PollConnection,beforeRequest:()=>Promise<void>) {
  if(Date.parse(connection.next_poll_at)>Date.now())return;
  await service.rpc("website-prune-personal-clickup-receipts");
  const started=connection.scan_started_at??new Date().toISOString();
  await beforeRequest();
  const result=await getClickUpTasks(connection.list_id,{page:connection.scan_page,updatedAfter:connection.last_polled_at?Math.max(0,Date.parse(connection.last_polled_at)-600_000):undefined});
  for(const task of result.tasks) {
    const saved=await service.rpc("website-queue-personal-inbound",{p_connection:connection.id,p_remote:task.id,p_dedupe:null});
    if(saved.error)throw new Error("Inbound queue unavailable");
  }
  const complete=result.tasks.length<100;
  const saved=await service.from(connections).update(complete?{last_polled_at:started,scan_page:0,scan_started_at:null,next_poll_at:new Date(Date.now()+900_000).toISOString()}:
    {scan_started_at:started,scan_page:connection.scan_page+1,next_poll_at:new Date().toISOString()}).eq("id",connection.id);
  if(saved.error)throw new Error("Reconciliation cursor unavailable");
  const sweep=await service.from(links).select("clickup_task_id").eq("connection_id",connection.id).is("archived_at",null).not("clickup_task_id","is",null)
    .or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now()-900_000).toISOString()}`).order("last_checked_at",{nullsFirst:true}).limit(5);
  if(sweep.error)throw new Error("Mirror sweep unavailable");
  for(const link of sweep.data??[]) {const queued=await service.rpc("website-queue-personal-inbound",{p_connection:connection.id,p_remote:link.clickup_task_id,p_dedupe:null});if(queued.error)throw new Error("Mirror sweep queue unavailable");}
}

export async function processPersonalInbox(service:SupabaseClient,connection:PersonalConnection,token:string,beforeRequest:()=>Promise<void>) {
  const queued=await service.from(inbox).select("remote_id,revision").eq("connection_id",connection.id).lte("available_at",new Date().toISOString()).order("available_at").limit(10);
  if(queued.error)throw new Error("Inbound queue unavailable");
  let changed=0;
  async function process(remoteId:string,depth=0):Promise<void> {
    const found=await service.from(links).select("*").eq("connection_id",connection.id).eq("clickup_task_id",remoteId).maybeSingle();
    if(found.error)throw new Error("Mirror identity unavailable");
    const link=found.data as PersonalLink|null;
    await beforeRequest();
    let remote:ClickUpTask;
    try {remote=await getClickUpTask(remoteId);}catch(error){
      if(!(error instanceof ClickUpApiError)||error.status!==404)throw error;
      if(link&&!link.archived_at)await service.from(links).update({last_error:"The personal ClickUp mirror was deleted. The shared CRM record has been retained.",last_checked_at:new Date().toISOString()}).eq("connection_id",connection.id).eq("record_kind",link.record_kind).eq("record_id",link.record_id);
      return;
    }
    if(String(remote.list?.id??"")!==connection.list_id||!remote.assignees?.some(person=>String(person.id)===String(connection.assigned_user_id))||remote.archived) {
      if(link&&!link.archived_at)await service.from(links).update({last_error:"The ClickUp copy was moved, archived or unassigned. Its shared CRM record has not been changed.",last_checked_at:new Date().toISOString()}).eq("connection_id",connection.id).eq("record_kind",link.record_kind).eq("record_id",link.record_id);
      return;
    }
    const remoteHash=personalRemoteHash(remote),ownedHash=personalOwnedHash(remote);
    if(link) {
      if(link.archived_at)return;
      if(!ownsPersonalMirror(remote,connection,link.record_kind,link.record_id,link.generation)&&!(link.origin==="clickup"&&!link.identity_confirmed&&remoteHash===link.last_remote_hash))throw new Error("The remote identity changed. No CRM record was updated.");
      if(link.last_remote_hash===remoteHash){await service.from(links).update({last_checked_at:new Date().toISOString()}).eq("connection_id",connection.id).eq("record_kind",link.record_kind).eq("record_id",link.record_id);return;}
      if(!link.last_shared_state)return; // An outbound reservation must finish first.
      if(link.last_owned_hash&&link.last_owned_hash!==ownedHash)throw new Error("The brief, assignment or parent changed in ClickUp. Review this mirror before continuing.");
      const current=await currentRecord(service,connection,link);if(!current)return;
      const incoming=personalSharedState(link.record_kind,remote,link.last_shared_state);
      const decision=decidePersonalInbound({baseline:link.last_shared_state,current:current.shared,remote:incoming,derivedJobStatus:current.derived});
      if(decision==="conflict"&&link.accept_remote_hash!==remoteHash)throw new Error("Both CRM and ClickUp changed this item. Choose which version to keep in Manage team.");
      if(decision==="derived-status")throw new Error("This job’s stage follows its linked assets. Change the assets’ stages instead, or restore the CRM version.");
      if(decision==="apply"||(decision==="conflict"&&link.accept_remote_hash===remoteHash)) {
        const stage=mappedStage(connection,incoming.status);
        const taskKey={planning:"not_started",scheduled:"not_started",production:"in_progress",review:"ready_for_revision",delayed:"delayed",delivered:"posted_done"}[stage];
        const applied=await service.rpc("website-apply-personal-clickup",{p_connection:connection.id,p_token:token,p_remote:remote.id,p_kind:link.record_kind,p_record:link.record_id,p_parent:current.parent,
          p_expected:current.updated,p_parent_expected:current.parentUpdated,p_state:incoming,p_status_key:incoming.status===current.shared.status?current.statusKey:link.record_kind==="job"?stage:taskKey,p_remote_hash:remoteHash,p_owned_hash:ownedHash,p_description:null});
        if(applied.error)throw new Error("The CRM record changed while syncing. No incoming changes were applied; retry after reviewing it.");changed++;
      }else{
        // An echo of an outbound write is acknowledged without another CRM edit.
        const saved=await service.from(links).update({last_checked_at:new Date().toISOString(),last_remote_hash:remoteHash,last_owned_hash:ownedHash}).eq("connection_id",connection.id).eq("record_kind",link.record_kind).eq("record_id",link.record_id);
        if(saved.error)throw new Error("Mirror baseline unavailable");
      }
      return;
    }
    // Never turn another connection's generated mirror into a duplicate job.
    if(containsCrmIdentity(remote))return;
    let kind:PersonalKind="job",parent:string|null=null;
    if(remote.parent) {
      if(depth)throw new Error("Nested ClickUp subtasks need to be flattened before importing.");
      let parentLink=await service.from(links).select("record_id").eq("connection_id",connection.id).eq("record_kind","job").eq("clickup_task_id",remote.parent).is("archived_at",null).maybeSingle();
      if(parentLink.error)throw new Error("Parent identity unavailable");
      if(!parentLink.data){await process(remote.parent,depth+1);parentLink=await service.from(links).select("record_id").eq("connection_id",connection.id).eq("record_kind","job").eq("clickup_task_id",remote.parent).is("archived_at",null).maybeSingle();}
      if(!parentLink.data)throw new Error("Assign the parent ClickUp job to this person before importing its subtask.");
      kind="task";parent=parentLink.data.record_id;
    }
    const incoming=personalSharedState(kind,remote),stage=mappedStage(connection,incoming.status);
    const taskKey={planning:"not_started",scheduled:"not_started",production:"in_progress",review:"ready_for_revision",delayed:"delayed",delivered:"posted_done"}[stage];
    const saved=await service.rpc("website-apply-personal-clickup",{p_connection:connection.id,p_token:token,p_remote:remote.id,p_kind:kind,p_record:null,p_parent:parent,p_expected:null,p_parent_expected:null,
      p_state:incoming,p_status_key:kind==="job"?stage:taskKey,p_remote_hash:remoteHash,p_owned_hash:ownedHash,p_description:(remote.description??remote.markdown_description??"").slice(0,20000)});
    if(saved.error)throw new Error("The incoming item could not be safely claimed. Check its parent, dates and status, then retry.");changed++;
  }
  for(const item of queued.data??[]) {
    try{
      await process(item.remote_id);
      const removed=await service.from(inbox).delete().eq("connection_id",connection.id).eq("remote_id",item.remote_id).eq("revision",item.revision);if(removed.error)throw new Error("Inbound acknowledgement unavailable");
    }catch(error){
      // The request-budget/lease sentinel must reach the outer worker. Do not
      // turn a normal bounded continuation into a visible record conflict.
      if(error instanceof Error&&error.name==="PersonalSyncDeferred")throw error;
      const message=error instanceof ClickUpApiError?"ClickUp could not confirm this item. It will retry safely.":error instanceof Error?error.message:"The incoming change needs review.";
      const attention=await service.from(inbox).update({last_error:message,available_at:new Date(Date.now()+3_600_000).toISOString()}).eq("connection_id",connection.id).eq("remote_id",item.remote_id).eq("revision",item.revision);
      if(attention.error)throw new Error("Inbound status unavailable");
      const known=await service.from(links).update({last_error:message}).eq("connection_id",connection.id).eq("clickup_task_id",item.remote_id);if(known.error)throw new Error("Conflict status unavailable");
    }
  }
  return changed;
}
