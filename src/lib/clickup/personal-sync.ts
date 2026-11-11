import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { buildClickUpJobPayload, type ClickUpJobSnapshot } from "./job-mapping";
import { buildClickUpAssetPayload, type ClickUpAssetSnapshot } from "./task-mapping";
import { clickUpJobProgress } from "./job-progress";
import { ClickUpApiError, createClickUpTask, getClickUpTask, getClickUpTasks, updateClickUpTask, type ClickUpTask } from "./client";
import { getClickUpToken } from "./config";
import { personalMarker, ownsPersonalMirror, RESERVED_PERSONAL_LISTS, type PersonalConnection, type PersonalKind } from "./personal-model";
import { PersonalMirrorReview, syncPersonalMirror, type PersonalDesired, type PersonalLink } from "./personal-sync-core";
import {pollPersonalList,processPersonalInbox} from "./personal-inbound";

export const PERSONAL_CONNECTIONS = "website-clickup-personal-connections";
export const PERSONAL_LINKS = "website-clickup-personal-links";
export const PERSONAL_QUEUE = "website-clickup-personal-outbox";
class Deferred extends Error {constructor(message?:string){super(message);this.name="PersonalSyncDeferred";}}
type QueueItem = { connection_id: string; record_kind: PersonalKind; record_id: string; revision: number };
type SourceJob = ClickUpJobSnapshot & { workspace_id: string; client_id: string; status_id: string; archived_at: string | null; assignee_ids: string[]; priority:"low"|"normal"|"high"|"urgent" };
type SourceTask = ClickUpAssetSnapshot & { workspace_id: string; job_id: string; status_id: string; archived_at: string | null; assignee_ids: string[] };
const jobColumns = "id,title,job_number,description,brief_details,deliverables,shoot_date,shoot_time,due_date,due_time,location,delivery_url,photos_delivered,notes,workspace_id,client_id,status_id,archived_at,assignee_ids,priority";

function safeFailure(error: unknown) {
  if (error instanceof PersonalMirrorReview) return error.message;
  if (error instanceof ClickUpApiError && error.status === 429) return "ClickUp is limiting requests. This connection will retry automatically.";
  if (error instanceof ClickUpApiError && [401,403,404].includes(error.status)) return "Check that the connected ClickUp account can still access this list.";
  return "This personal list could not finish syncing. Your CRM records and John’s existing connections have not been changed.";
}

async function desiredRecord(service: SupabaseClient, connection: PersonalConnection, item: QueueItem, clientId: string): Promise<PersonalDesired | null> {
  let task: SourceTask | null = null;
  let jobId = item.record_id;
  if (item.record_kind === "task") {
    const result = await service.from("website-job-tasks").select("id,title,description,asset_type,hours,priority,due_date,due_time,due_date_is_override,status_id,job_id,archived_at,assignee_ids")
      .eq("workspace_id", connection.workspace_id).eq("id", item.record_id).maybeSingle();
    if (result.error) throw result.error;
    task = result.data as SourceTask | null;
    if (!task || task.archived_at || !task.assignee_ids.includes(connection.user_id)) return null;
    jobId = task.job_id;
  }
  const result = await service.from("website-jobs").select(jobColumns).eq("workspace_id", connection.workspace_id).eq("id", jobId).maybeSingle();
  if (result.error) throw result.error;
  const job = result.data as SourceJob | null;
  if (!job || job.archived_at || job.client_id !== clientId) return null;
  const status = await service.from("website-job-statuses").select("key").eq("workspace_id", connection.workspace_id).eq("id", job.status_id).single();
  if (status.error || !status.data) throw new Error("Status unavailable");
  const jobKey = status.data.key as string;
  if (!task) {
    if (!job.assignee_ids.includes(connection.user_id)) return null;
    const tasks = await service.from("website-job-tasks").select("source_deliverable_id,status:website-task-statuses!website-job-tasks-status-fkey(key)")
      .eq("workspace_id", connection.workspace_id).eq("job_id", job.id).is("archived_at", null);
    if (tasks.error) throw tasks.error;
    const progress = clickUpJobProgress((tasks.data ?? []) as unknown as Parameters<typeof clickUpJobProgress>[0], job.deliverables ?? [], jobKey);
    const stage = connection.status_mapping[jobKey];
    if (!stage) throw new PersonalMirrorReview("Map this job stage to a ClickUp status in Manage team.");
    return { title: job.title, parent: null, payload: generation => {
      const payload = buildClickUpJobPayload({ assignedUserId: connection.assigned_user_id, job: { ...job, progress }, status: stage });
      payload.markdown_content = payload.markdown_content.replace(`Synced from John's CRM · Job ID: \`${job.id}\``, personalMarker(connection.id,"job",job.id,generation));
      return {...payload,priority:({urgent:1,high:2,normal:3,low:4})[job.priority]??3};
    } };
  }
  const taskStatus = await service.from("website-task-statuses").select("key").eq("workspace_id", connection.workspace_id).eq("id", task.status_id).single();
  if (taskStatus.error || !taskStatus.data) throw new Error("Task status unavailable");
  const key = taskStatus.data.key as string;
  const stageKey = key === "posted_done" ? "delivered" : key === "delayed" ? "delayed" : key === "not_started" ? (jobKey === "planning" ? "planning" : "scheduled") : key === "in_progress" ? "production" : "review";
  const stage = connection.status_mapping[stageKey];
  if (!stage) throw new PersonalMirrorReview("Map this asset stage to a ClickUp status in Manage team.");
  let parent: string | null = null;
  if (job.assignee_ids.includes(connection.user_id)) {
    const parentLink = await service.from(PERSONAL_LINKS).select("clickup_task_id,archived_at,last_error")
      .eq("connection_id", connection.id).eq("record_kind", "job").eq("record_id", job.id).maybeSingle();
    if (parentLink.error) throw parentLink.error;
    if (!parentLink.data?.clickup_task_id || parentLink.data.archived_at || parentLink.data.last_error) throw new Deferred("Parent is not ready");
    parent = parentLink.data.clickup_task_id;
  }
  const asset = { ...task, status: { key } };
  return { title: task.title, parent, payload: generation => {
    const payload = buildClickUpAssetPayload({ workspaceId: connection.workspace_id, assignedUserId: connection.assigned_user_id, parentTaskId: parent ?? "", task: asset,
      job: { id: job.id, title: job.title, due_date: job.due_date, due_time: job.due_time, status_key: jobKey } });
    const markerIndex = payload.markdown_content.lastIndexOf("Synced from John's CRM");
    const description = `${payload.markdown_content.slice(0, markerIndex)}${personalMarker(connection.id,"task",task!.id,generation)}`;
    const fields:Record<string,unknown> = {...payload}; delete fields.parent;
    return { ...fields, ...(parent ? { parent } : {}), status: stage, markdown_content: description };
  } };
}

/** One bounded invocation shared by after-response updates and the existing
 * cron. Only dirty records are touched; an empty connection makes no API calls. */
export async function dispatchPersonalClickUpSync(connectionId?: string) {
  const service = createServiceClient();
  if (!service || !getClickUpToken()) return { status: "not-configured" };
  let query = service.from(PERSONAL_CONNECTIONS).select("*").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("enabled",true)
    .eq("ready",true)
    .lte("next_sync_at", new Date().toISOString()).order("next_sync_at").limit(4);
  if (connectionId) query = query.eq("id",connectionId);
  const result = await query;
  if (result.error) return { status: "unavailable" };
  if (!result.data?.length) return { status: "idle" };
  const deadline = Date.now()+45_000;
  let requestCount = 0, processed = 0, issues = 0;
  for (const connection of result.data as PersonalConnection[]) {
    if (Date.now()>deadline || requestCount>=25 || RESERVED_PERSONAL_LISTS.has(connection.list_id)) break;
    const token = randomUUID();
    async function lease(action: "claim" | "renew" | "release") {
      const { data, error } = await service!.rpc("website-personal-clickup-lease", { p_connection: connection.id, p_token: token, p_action: action });
      if (error) throw new Deferred(); return data === true;
    }
    if (!await lease("claim")) continue;
    async function beforeRequest() {
      if (Date.now()>deadline || requestCount>=25 || !await lease("renew")) throw new Deferred();
      const budget=await service!.rpc("website-personal-clickup-request",{p_workspace:connection.workspace_id});
      if(budget.error||budget.data!==true)throw new Deferred();
      requestCount++;
    }
    try {
      await pollPersonalList(service,connection as Parameters<typeof pollPersonalList>[1],beforeRequest);
      await processPersonalInbox(service,connection,token,beforeRequest);
      const queued = await service.from(PERSONAL_QUEUE).select("connection_id,record_kind,record_id,revision").eq("connection_id", connection.id)
        .order("record_kind").order("requested_at").limit(20);
      if (queued.error) throw queued.error;
      if (!queued.data?.length) {
        await service.from(PERSONAL_CONNECTIONS).update({last_success_at:new Date().toISOString(),last_error:null,next_sync_at:new Date(Date.now()+30_000).toISOString()}).eq("id",connection.id).eq("lease_token",token);
        continue;
      }
      const client = await service.from("website-clients").select("id").eq("workspace_id", connection.workspace_id).ilike("name","Autopacific Group").is("archived_at",null).single();
      if (client.error || !client.data) throw new Error("Client scope unavailable");
      const owned = await service.from(PERSONAL_LINKS).select("clickup_task_id").eq("connection_id",connection.id).not("clickup_task_id","is",null).limit(10000);
      if (owned.error) throw owned.error;
      const ownedIds = new Set((owned.data ?? []).map(item => item.clickup_task_id));
      for (const item of queued.data as QueueItem[]) {
        if (Date.now()>deadline || requestCount>=25) throw new Deferred();
        const found = await service.from(PERSONAL_LINKS).select("*").eq("connection_id", connection.id).eq("record_kind",item.record_kind).eq("record_id",item.record_id).maybeSingle();
        if (found.error) throw found.error;
        const link: PersonalLink = found.data ?? { connection_id:item.connection_id,record_kind:item.record_kind,record_id:item.record_id, record_title: "", clickup_task_id: null, parent_task_id: null, generation: 1, previous_task_ids: [],
          create_attempted_at: null, last_payload_hash: null, last_remote_hash: null, overwrite_hash: null, archived_at: null, last_error: null,
          origin:"crm",identity_confirmed:false,last_shared_state:null,last_owned_hash:null,accept_remote_hash:null };
        async function save(values: Partial<PersonalLink> & { last_synced_at?: string }) {
          const identity = {connection_id:item.connection_id,record_kind:item.record_kind,record_id:item.record_id};
          const saved = await service!.from(PERSONAL_LINKS).upsert({ ...link, ...identity, ...values }, { onConflict: "connection_id,record_kind,record_id" });
          if (saved.error) throw saved.error;
          Object.assign(link,values);
        }
        try {
          const desired = await desiredRecord(service,connection,item,client.data.id);
          if (!found.data && !desired) {
            await service.from(PERSONAL_QUEUE).delete().eq("connection_id",connection.id).eq("record_kind",item.record_kind).eq("record_id",item.record_id).eq("revision",item.revision);
            continue;
          }
          await syncPersonalMirror(connection, link, desired, {
            beforeRequest, save, get: id => getClickUpTask(id,{ includeSubtasks: true }), ownsChild: id => ownedIds.has(id),
            create: payload => createClickUpTask(connection.list_id,payload), update: updateClickUpTask,
            recover: async generation => {
              const matches = new Map<string,ClickUpTask>();
              for (const archived of [false,true]) {
                let complete = false;
                for (let page=0;page<10;page++) {
                  await beforeRequest();
                  const pageResult = await getClickUpTasks(connection.list_id,{page,archived});
                  for (const task of pageResult.tasks) if (ownsPersonalMirror(task,connection,item.record_kind,item.record_id,generation)) matches.set(task.id,task);
                  if (pageResult.tasks.length<100) { complete=true;break; }
                }
                if (!complete) throw new Deferred();
              }
              if (matches.size>1) throw new PersonalMirrorReview("Duplicate mirror identities were found in ClickUp. Review them before retrying.");
              const match=[...matches.values()][0];
              if(!match)return null;
              await beforeRequest();return getClickUpTask(match.id,{includeSubtasks:true});
            },
          });
          if (link.clickup_task_id) ownedIds.add(link.clickup_task_id);
          const removed = await service.from(PERSONAL_QUEUE).delete().eq("connection_id",connection.id).eq("record_kind",item.record_kind).eq("record_id",item.record_id).eq("revision",item.revision);
          if (removed.error) throw removed.error;
          processed++;
        } catch (error) {
          if (error instanceof Deferred) throw error;
          const message = safeFailure(error); await save({ last_error: message }); issues++;
          if (error instanceof PersonalMirrorReview) {
            // Attention items remain visible in Manage team but do not spin on
            // every cron. A source edit or explicit Retry queues them again.
            await service.from(PERSONAL_QUEUE).delete().eq("connection_id",connection.id).eq("record_kind",item.record_kind).eq("record_id",item.record_id).eq("revision",item.revision);
          } else throw error;
        }
      }
      await service.from(PERSONAL_CONNECTIONS).update({ last_success_at:new Date().toISOString(),last_error:null,failure_count:0,next_sync_at:new Date(Date.now()+30_000).toISOString() }).eq("id",connection.id).eq("lease_token",token);
    } catch (error) {
      await service.from(PERSONAL_CONNECTIONS).update({ last_error:error instanceof Deferred?null:safeFailure(error),next_sync_at:new Date(Date.now()+(error instanceof Deferred?30:120)*1000).toISOString() }).eq("id",connection.id).eq("lease_token",token);
    } finally { try { await lease("release"); } catch { /* lease expires */ } }
  }
  return { status:"completed",processed,issues,requests:requestCount };
}
