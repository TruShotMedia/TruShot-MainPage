import "server-only";
import { randomUUID } from "node:crypto";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import type { CalendarCustomEvent } from "@/lib/types";
import { assignedToClickUpOwner } from "./assignment-scope";
import { ClickUpApiError, createClickUpTask, getClickUpList, getClickUpTask, getClickUpTasks, updateClickUpTask, type ClickUpTask } from "./client";
import { getClickUpToken } from "./config";
import { extractOutlookMirror } from "./outlook-mapping";
import { syncOutlookMirrors, type OutlookLink } from "./outlook-sync-core";

const TABLE = "website-clickup-outlook-bridge";
const LINKS = "website-clickup-outlook-links";
const linkColumns = "calendar_id,event_id,clickup_task_id,last_payload_hash,create_attempted_at,archived_at";
class BatchDeferred extends Error {}
function safeError(error: unknown) {
  if (error instanceof ClickUpApiError && error.status === 429) return "ClickUp is rate limiting updates. Sync will retry automatically.";
  if (error instanceof ClickUpApiError && [401,403,404].includes(error.status)) return "Check that the connected ClickUp profile can access the Outlook destination list.";
  // Never expose raw provider errors, source contents, feed URLs or tokens.
  return "Outlook events could not finish syncing to ClickUp. Your Outlook calendar has not been changed.";
}
export async function readOutlookBridgeStatus(ownerId: string) {
  const service = createServiceClient();
  if (!service) return null;
  const { data, error } = await service.from(TABLE).select("enabled,list_id,last_success_at,last_error,last_counts")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", ownerId).maybeSingle();
  if (error) throw new Error("Outlook bridge status unavailable");
  return data;
}
export async function dispatchOutlookClickUpSync(ownerId?: string) {
  const service = createServiceClient();
  if (!service || !getClickUpToken()) return { status: "not-configured" };
  let query = service.from(TABLE).select("user_id,list_id,enabled,failure_count")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("enabled", true);
  if (ownerId) query = query.eq("user_id", ownerId);
  const { data: bridge, error: configError } = await query.maybeSingle();
  if (configError) return { status: "unavailable" };
  if (!bridge) return { status: "disabled" };
  const token = randomUUID();
  async function lease(action: "claim" | "renew" | "release") {
    const { data, error } = await service!.rpc("website-clickup-outlook-lease", { p_workspace_id: TRUSHOT_WORKSPACE_ID, p_token: token, p_action: action });
    if (error) throw new Error("Outlook bridge lock unavailable");
    return data === true;
  }
  if (!await lease("claim")) return { status: "busy" };
  const deadline = Date.now() + 55_000;
  let requests = 0;
  async function beforeRequest() {
    if (Date.now() > deadline || requests >= 35) throw new BatchDeferred();
    // Also rechecks enabled state before EVERY external request; the database
    // lease survives individual HTTP timeouts, but no open transaction does.
    if (!await lease("renew")) throw new BatchDeferred();
    requests++;
  }
  try {
    const { data: integration, error: integrationError } = await service.from("website-clickup-integrations")
      .select("enabled,assigned_user_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle();
    if (integrationError || !integration?.enabled || !integration.assigned_user_id) throw new Error("ClickUp disabled");
    if (!await assignedToClickUpOwner(service, TRUSHOT_WORKSPACE_ID, [bridge.user_id])) throw new Error("Owner mismatch");
    const { data: calendar, error: calendarError } = await service.from("website-outlook-calendars")
      .select("id,events,source_format_version,last_success_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", bridge.user_id).maybeSingle();
    if (calendarError) throw new Error("Snapshot unavailable");
    if (calendar && (calendar.source_format_version !== 2 || !calendar.last_success_at)) throw new BatchDeferred();
    const links: OutlookLink[]=[];
    // Do not silently truncate at PostgREST's default 1,000-row page size as
    // completed history grows. A bounded, incomplete scan fails closed.
    for(let page=0;page<10;page++) {
      const {data,error}=await service.from(LINKS).select(linkColumns).eq("workspace_id",TRUSHOT_WORKSPACE_ID)
        .order("calendar_id").order("event_id").range(page*1000,page*1000+999);
      if(error)throw new Error("Links unavailable");
      links.push(...(data??[]) as OutlookLink[]);
      if((data??[]).length<1000)break;
      if(page===9)throw new Error("Mirror history requires review");
    }
    await beforeRequest();
    const list = await getClickUpList(bridge.list_id);
    if (String(list.id) !== bridge.list_id) throw new Error("List mismatch");
    const statuses = list.statuses ?? [];
    const open = statuses.find(s => ["scheduled","to do","open"].includes(s.status.toLowerCase())) ?? statuses.find(s => s.type === "open");
    const complete = statuses.find(s => s.type === "closed") ?? statuses.find(s => s.status.toLowerCase() === "complete");
    if (!open || !complete) throw new Error("Destination statuses unavailable");
    let recoveryTasks: ClickUpTask[] | null = null;
    async function recover(link: OutlookLink) {
      if (!recoveryTasks) {
        const tasks = new Map<string,ClickUpTask>();
        // Only used after an uncertain create, not as an every-refresh poll.
        for (const archived of [false,true]) {
          let completeScan = false;
          for (let page=0; page<10; page++) {
            await beforeRequest();
            const result = await getClickUpTasks(bridge!.list_id, { page, archived });
            for (const task of result.tasks) tasks.set(task.id,task);
            if (result.tasks.length < 100) { completeScan=true; break; }
          }
          if (!completeScan) throw new BatchDeferred();
        }
        recoveryTasks = [...tasks.values()];
      }
      const matches = recoveryTasks.filter(task => {
        const identity = extractOutlookMirror(task.markdown_description ?? task.description);
        return identity?.calendarId === link.calendar_id && identity.eventId === link.event_id;
      });
      if (matches.length > 1) throw new Error("Duplicate remote identity");
      return matches[0] ?? null;
    }
    const counts = await syncOutlookMirrors({ calendarId: calendar?.id ?? null, events: (calendar?.events ?? []) as CalendarCustomEvent[],
      links, assignedUserId: integration.assigned_user_id, listId: bridge.list_id,
      openStatus: open.status, completeStatus: complete.status, now: new Date(), port: {
        beforeRequest, recover,
        get: getClickUpTask,
        create: payload => createClickUpTask(bridge.list_id,payload),
        update: updateClickUpTask,
        save: async (link,values) => {
          const { error } = await service.from(LINKS).upsert({ workspace_id: TRUSHOT_WORKSPACE_ID, ...link, ...values }, { onConflict: "workspace_id,calendar_id,event_id" });
          if (error) throw new Error("Outlook mirror mapping could not be saved");
          Object.assign(link,values);
        },
      } });
    const { error: saveError } = await service.from(TABLE).update({ last_success_at: new Date().toISOString(), last_error: null, failure_count: 0,
      last_counts: counts, next_sync_at: new Date(Date.now()+60_000).toISOString() }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("lease_token",token);
    if (saveError) throw new Error("Bridge status unavailable");
    return { status: "completed", ...counts };
  } catch (error) {
    const deferred = error instanceof BatchDeferred;
    const failures = deferred ? bridge.failure_count : bridge.failure_count+1;
    await service.from(TABLE).update({ last_error: deferred ? null : safeError(error), failure_count: failures,
      next_sync_at: new Date(Date.now()+(deferred ? 60 : Math.min(3600,60*2**Math.min(failures,6)))*1000).toISOString() })
      .eq("workspace_id",TRUSHOT_WORKSPACE_ID).eq("lease_token",token);
    return { status: deferred ? "pending" : "unavailable" };
  } finally { try { await lease("release"); } catch { /* bounded expiry */ } }
}
