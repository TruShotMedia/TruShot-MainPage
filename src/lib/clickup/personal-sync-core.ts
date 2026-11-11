import { ClickUpApiError, type ClickUpTask } from "./client";
import { ownsPersonalMirror, personalOwnedHash, personalPayloadHash, personalPayloadShared, personalRemoteHash,personalSharedState, type PersonalConnection, type PersonalKind } from "./personal-model";
import type { ClickUpSharedState } from "./shared-state";

export type PersonalLink = {
  connection_id: string; record_kind: PersonalKind; record_id: string; record_title: string;
  clickup_task_id: string | null; parent_task_id: string | null; generation: number; previous_task_ids: string[];
  create_attempted_at: string | null; last_payload_hash: string | null; last_remote_hash: string | null;
  overwrite_hash: string | null; archived_at: string | null; last_error: string | null;
  origin: "crm"|"clickup"; identity_confirmed:boolean;
  last_shared_state:ClickUpSharedState|null; last_owned_hash:string|null;
  accept_remote_hash:string|null;
};
export type PersonalDesired = { title: string; parent: string | null; payload: (generation: number) => Record<string, unknown> };
export type PersonalSyncPort = {
  beforeRequest: () => Promise<void>;
  save: (values: Partial<PersonalLink> & { last_synced_at?: string }) => Promise<void>;
  get: (id: string) => Promise<ClickUpTask>;
  recover: (generation: number) => Promise<ClickUpTask | null>;
  create: (payload: Record<string, unknown>) => Promise<ClickUpTask>;
  update: (id: string, payload: Record<string, unknown>) => Promise<unknown>;
  ownsChild: (id: string) => boolean;
};
export class PersonalMirrorReview extends Error {}

/** A single, leased, one-way mirror. Identity reservations precede external
 * writes; ambiguous POSTs never cause a blind second POST. No CRM edits occur. */
export async function syncPersonalMirror(connection: PersonalConnection, link: PersonalLink, desired: PersonalDesired | null, port: PersonalSyncPort) {
  async function save(values: Partial<PersonalLink> & { last_synced_at?: string }) { await port.save(values); Object.assign(link, values); }
  let payload = desired?.payload(link.generation);
  let hash = payload ? personalPayloadHash(payload) : null;
  // Database triggers queue changes. Repeated refreshes do not repeatedly GET
  // unchanged remote tasks. Explicit Retry clears this cached payload hash.
  if (desired && link.clickup_task_id && !link.archived_at && !link.last_error && link.last_remote_hash && link.last_payload_hash === hash) return "unchanged";
  let remote: ClickUpTask | null = null;
  if (link.clickup_task_id) {
    await port.beforeRequest();
    try { remote = await port.get(link.clickup_task_id); }
    catch (error) {
      if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
      if (!desired) { await save({ archived_at: new Date().toISOString(), last_error: null }); return "archived"; }
      if (link.overwrite_hash !== "missing") throw new PersonalMirrorReview("This ClickUp mirror was deleted. Use CRM version to recreate it, or leave it paused.");
      await save({ previous_task_ids: [...link.previous_task_ids, link.clickup_task_id], clickup_task_id: null,
        generation: link.generation + 1, create_attempted_at: null, last_payload_hash: null, last_remote_hash: null, overwrite_hash: null });
    }
  } else if (link.create_attempted_at) {
    remote = await port.recover(link.generation);
    if (!remote) throw new PersonalMirrorReview("An earlier create has not been confirmed by ClickUp. No duplicate has been created; check the list before retrying.");
    await save({ clickup_task_id: remote.id });
  }
  const importedClaim=remote&&link.origin==="clickup"&&!link.identity_confirmed&&personalRemoteHash(remote)===link.last_remote_hash
    &&String(remote.list?.id??"")===connection.list_id&&remote.assignees?.some(person=>String(person.id)===String(connection.assigned_user_id));
  if (remote && !ownsPersonalMirror(remote, connection, link.record_kind, link.record_id, link.generation) && !importedClaim) {
    throw new PersonalMirrorReview("The mirror was moved or its identity changed in ClickUp. It has been left untouched.");
  }
  if (remote && !(desired===null&&remote.archived) && !(link.last_remote_hash && personalRemoteHash(remote) === link.last_remote_hash) && link.overwrite_hash !== personalRemoteHash(remote)) {
    if(link.accept_remote_hash)throw new PersonalMirrorReview("A ClickUp version is awaiting an incoming sync. It has not been overwritten.");
    // A recovered POST has no baseline yet. It is safe to adopt only the exact
    // expected owned fields; never silently adopt an independently edited task.
    const expected = payload && remoteMatchesPayload(link.record_kind,remote, payload);
    if (!expected) throw new PersonalMirrorReview("This item changed in ClickUp. Review the changes, or choose Use CRM version to replace them.");
  }
  async function archiveRemote() {
    if (!remote) return;
    if (remote.subtasks?.some(child => !port.ownsChild(child.id))) throw new PersonalMirrorReview("This mirror has an unlinked ClickUp subtask. Review it before archiving the parent.");
    if (!remote.archived) {
      await port.beforeRequest(); await port.update(remote.id, { archived: true });
      await port.beforeRequest();const confirmed=await port.get(remote.id);
      if(!ownsPersonalMirror(confirmed,connection,link.record_kind,link.record_id,link.generation))throw new PersonalMirrorReview("Archived mirror identity could not be confirmed.");
      remote=confirmed;
    }
  }
  if (!desired) {
    if(importedClaim){await save({archived_at:new Date().toISOString(),last_error:null});return "archived";}
    await archiveRemote();
    await save({ archived_at: new Date().toISOString(), last_error: null, overwrite_hash: null,
      ...(remote?{last_remote_hash:personalRemoteHash(remote),last_owned_hash:personalOwnedHash(remote)}:{}) });
    return "archived";
  }
  if (remote && (remote.parent ?? null) !== desired.parent) {
    // ClickUp's task update API cannot reparent a task. Retain and archive the
    // old mirror, then reserve a new generation in the correct location.
    await archiveRemote();
    await save({ previous_task_ids: [...link.previous_task_ids, remote.id], clickup_task_id: null, generation: link.generation + 1,
      parent_task_id: desired.parent, create_attempted_at: null, last_payload_hash: null, last_remote_hash: null, overwrite_hash: null });
    remote = null;
  }
  payload = desired.payload(link.generation); hash = personalPayloadHash(payload);
  const created = !remote;
  if (remote) {
    await port.beforeRequest();
    const { assignees, ...fields } = payload;
    delete fields.parent;
    await port.update(remote.id, { ...fields, assignees: { add: assignees, rem: [] } });
  } else {
    await port.beforeRequest();
    await save({ create_attempted_at: new Date().toISOString(), parent_task_id: desired.parent, record_title: desired.title });
    try { remote = await port.create(payload); }
    catch (error) {
      if (error instanceof ClickUpApiError && error.status >= 400 && error.status < 500 && error.status !== 408) await save({ create_attempted_at: null });
      throw error;
    }
    if (!remote?.id) throw new PersonalMirrorReview("ClickUp has not confirmed the created task. Recovery will check it safely.");
    await save({ clickup_task_id: remote.id });
  }
  await port.beforeRequest();
  const confirmed = await port.get(remote!.id);
  if (!ownsPersonalMirror(confirmed, connection, link.record_kind, link.record_id, link.generation)) throw new PersonalMirrorReview("ClickUp did not confirm the mirror identity. Review this connection.");
  await save({ last_payload_hash: hash, last_remote_hash: personalRemoteHash(confirmed), archived_at: null, last_error: null,
    overwrite_hash: null, accept_remote_hash:null, parent_task_id: desired.parent, record_title: desired.title, identity_confirmed:true,
    last_shared_state:personalPayloadShared(link.record_kind,payload),last_owned_hash:personalOwnedHash(confirmed),last_synced_at: new Date().toISOString() });
  return created ? "created" : "updated";
}

function remoteMatchesPayload(kind:PersonalKind,remote: ClickUpTask, payload: Record<string, unknown>) {
  const expected=personalPayloadShared(kind,payload),actual=personalSharedState(kind,remote,expected);
  return (Object.keys(expected) as Array<keyof ClickUpSharedState>).every(key=>expected[key]===actual[key])
    && (remote.markdown_description ?? remote.description ?? "").trim() === String(payload.markdown_content ?? "").trim()
    && (payload.priority==null||String(remote.priority?.id??"")===String(payload.priority))
    && Boolean(remote.archived) === Boolean(payload.archived) && (remote.parent ?? null) === (payload.parent ?? null)
    && (payload.assignees as number[]).every(id => remote.assignees?.some(person => String(person.id) === String(id)));
}
