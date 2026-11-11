import { createHash } from "node:crypto";
import type { ClickUpTask } from "./client";
import { sharedStateFromClickUp, type ClickUpSharedState } from "./shared-state";

export const PERSONAL_TEAM_ID = "9003084068";
export const RESERVED_PERSONAL_LISTS = new Set(["1300350000002054", "1300350000012117"]);
export const PERSONAL_JOB_STAGES = ["planning", "scheduled", "production", "review", "delayed", "delivered"] as const;
const aliases: Record<string, string[]> = {
  planning: ["PLANNING"], scheduled: ["SCHEDULED", "TO DO"], production: ["EDITING", "IN PROGRESS", "CONTENT CAPTURED"],
  review: ["APPROVAL", "IN REVIEW", "REVIEW"], delayed: ["DELAYED", "ON HOLD"], delivered: ["COMPLETE", "COMPLETED", "DONE", "CLOSED"],
};
export type PersonalKind = "job" | "task";
export type PersonalConnection = {
  id: string; workspace_id: string; user_id: string; list_id: string; list_name: string;
  assigned_user_id: number; assigned_user_name: string; status_mapping: Record<string, string>;
  enabled: boolean; last_success_at?: string | null; last_error?: string | null;
};
export type PersonalConnectionView = PersonalConnection & { pending: number; issues: Array<{ record_kind: PersonalKind; record_id: string; record_title: string; last_error: string }>; incoming:Array<{remote_id:string;last_error:string}> };

export function parsePersonalListUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Paste the full ClickUp list URL."); }
  if (url.protocol !== "https:" || url.hostname !== "app.clickup.com" || url.port || url.username || url.password) throw new Error("Use an https://app.clickup.com list URL.");
  const match = /^\/(\d+)\/v\/l\/li\/(\d+)\/?$/.exec(url.pathname);
  if (!match || match[1] !== PERSONAL_TEAM_ID) throw new Error("Choose a list in your AutoPacific ClickUp workspace.");
  if(!Number.isSafeInteger(Number(match[2]))||Number(match[2])<1)throw new Error("That list ID is not supported by the ClickUp API.");
  if (RESERVED_PERSONAL_LISTS.has(match[2])) throw new Error("John’s Jobs and Outlook lists are reserved and cannot be changed here.");
  return { listId: match[2], url: `https://app.clickup.com/${PERSONAL_TEAM_ID}/v/l/li/${match[2]}` };
}

export function suggestedPersonalStatuses(statuses: readonly { status: string; type?: string }[]) {
  return Object.fromEntries(PERSONAL_JOB_STAGES.map(key => [key, statuses.find(item => aliases[key].includes(item.status.trim().toUpperCase()))?.status ?? ""]));
}

export function personalMarker(connectionId: string, kind: PersonalKind, recordId: string, generation: number) {
  return `CRM personal mirror · Connection: ${connectionId} · ${kind}: ${recordId} · Generation: ${generation}`;
}
export function ownsPersonalMirror(task: ClickUpTask, connection: Pick<PersonalConnection, "id" | "list_id">, kind: PersonalKind, recordId: string, generation: number) {
  return String(task.list?.id ?? "") === connection.list_id && (task.markdown_description ?? task.description ?? "").split("\n").some(line => line.trim() === personalMarker(connection.id, kind, recordId, generation));
}

export function personalPayloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
/** Compare fields owned by this one-way connection. Never silently overwrite
 * independent ClickUp edits, reassignment, moves or unexpected parent changes. */
export function personalRemoteHash(task: ClickUpTask) {
  return personalPayloadHash({ name: task.name ?? "", status: task.status?.status?.trim().toUpperCase() ?? "",
    start_date: task.start_date ?? null, due_date: task.due_date ?? null,
    start_date_time:task.start_date_time??null,due_date_time:task.due_date_time??null,priority:task.priority?.id==null?null:String(task.priority.id),
    archived: Boolean(task.archived), parent: task.parent ?? null,
    description: (task.markdown_description ?? task.description ?? "").trim(),
    assignees: (task.assignees ?? []).map(item => String(item.id)).sort(),
  });
}

export function personalSharedState(kind:PersonalKind, task:ClickUpTask, baseline?:ClickUpSharedState|null):ClickUpSharedState {
  const normal = sharedStateFromClickUp({ ...task,
    start_date_time:task.start_date_time??(baseline?.shoot_time===null?false:undefined),
    due_date_time:task.due_date_time??(baseline?.due_time===null?false:undefined),
  },{linkedJob:kind==="job"});
  return kind==="task"?{...normal,shoot_date:null,shoot_time:null}:normal;
}
export function personalPayloadShared(kind:PersonalKind,payload:Record<string,unknown>) {
  return personalSharedState(kind,{id:"expected",name:String(payload.name),status:{status:String(payload.status)},
    start_date:payload.start_date==null?null:String(payload.start_date),start_date_time:Boolean(payload.start_date_time),
    due_date:payload.due_date==null?null:String(payload.due_date),due_date_time:Boolean(payload.due_date_time)});
}
export function personalOwnedHash(task:ClickUpTask) {
  return personalPayloadHash({description:(task.markdown_description??task.description??"").trim(),parent:task.parent??null,
    list:String(task.list?.id??""),assignees:(task.assignees??[]).map(item=>String(item.id)).sort(),archived:Boolean(task.archived),priority:task.priority?.id==null?null:String(task.priority.id)});
}
export function containsCrmIdentity(task:ClickUpTask) {
  return /CRM personal mirror · Connection:|Synced from John's CRM|Synced from TruShot CRM/.test(task.markdown_description??task.description??"");
}

/** A shared record has one CRM baseline per mirror. Concurrent edits stop for
 * review; simple remote-only changes are imported, then fan out via the normal
 * CRM triggers. Job status derived from assets cannot be overridden remotely. */
export function decidePersonalInbound({baseline,current,remote,derivedJobStatus=false}:{baseline:ClickUpSharedState|null;current:ClickUpSharedState;remote:ClickUpSharedState;derivedJobStatus?:boolean}) {
  if(!baseline)return "wait";
  const equal=(a:ClickUpSharedState,b:ClickUpSharedState)=>(Object.keys(current) as Array<keyof ClickUpSharedState>).every(key=>a[key]===b[key]);
  if(equal(remote,baseline)||equal(remote,current))return "unchanged";
  if(derivedJobStatus&&remote.status!==current.status)return "derived-status";
  return !equal(current,baseline)?"conflict":"apply";
}
