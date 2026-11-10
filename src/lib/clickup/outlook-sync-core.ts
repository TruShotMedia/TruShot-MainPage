import type { CalendarCustomEvent } from "@/lib/types";
import { ClickUpApiError, type ClickUpTask } from "./client";
import { eligibleOutlookEvents, extractOutlookMirror, outlookMirrorPayload, outlookPayloadHash } from "./outlook-mapping";

export type OutlookLink = {
  calendar_id: string; event_id: string; clickup_task_id: string | null;
  last_payload_hash: string | null; create_attempted_at: string | null; archived_at: string | null;
};
export type OutlookMirrorPort = {
  beforeRequest: () => Promise<void>;
  save: (link: OutlookLink, values: Partial<OutlookLink> & { last_synced_at?: string }) => Promise<void>;
  get: (id: string) => Promise<ClickUpTask>;
  recover: (link: OutlookLink) => Promise<ClickUpTask | null>;
  create: (payload: Record<string, unknown>) => Promise<ClickUpTask>;
  update: (id: string, payload: Record<string, unknown>) => Promise<unknown>;
};

/** Stateful one-way reconciliation. Persistence reservations precede POST;
 * ambiguous creates are recovered by identity, NEVER blindly retried. */
export async function syncOutlookMirrors({ calendarId, events, links, assignedUserId, listId, openStatus, completeStatus, now, port }: {
  calendarId: string | null; events: CalendarCustomEvent[]; links: OutlookLink[];
  assignedUserId: number; listId: string; openStatus: string; completeStatus: string;
  now: Date; port: OutlookMirrorPort;
}) {
  const counts = { created: 0, updated: 0, archived: 0, unchanged: 0 };
  const known = new Map(links.filter(link => link.calendar_id === calendarId).map(link => [link.event_id, link]));
  const desired = calendarId ? eligibleOutlookEvents(events, new Set(known.keys()), now) : [];
  const active = new Set(desired.map(event => event.id));
  async function ownedRemote(link: OutlookLink) {
    let remote: ClickUpTask | null = null;
    if (link.clickup_task_id) {
      await port.beforeRequest();
      try { remote = await port.get(link.clickup_task_id); }
      catch (error) {
        if (!(error instanceof ClickUpApiError) || error.status !== 404) throw error;
        await port.save(link, { clickup_task_id: null, create_attempted_at: null, last_payload_hash: null });
        link.clickup_task_id = null; link.create_attempted_at = null;
      }
    } else if (link.create_attempted_at) {
      remote = await port.recover(link);
      if (!remote) throw new Error("An earlier Outlook task creation is awaiting confirmation. No duplicate was created.");
    }
    if (remote) {
      const identity = extractOutlookMirror(remote.markdown_description ?? remote.description);
      if (remote.parent || String(remote.list?.id ?? "") !== listId || identity?.calendarId !== link.calendar_id || identity?.eventId !== link.event_id) {
        throw new Error("An Outlook mirror was moved or its identity changed. Review it before syncing.");
      }
    }
    return remote;
  }
  for (const link of links) {
    if (link.archived_at || (link.calendar_id === calendarId && active.has(link.event_id))) continue;
    const remote = await ownedRemote(link);
    if (remote && !remote.archived) {
      await port.beforeRequest(); await port.update(remote.id, { archived: true });
    }
    await port.save(link, { clickup_task_id: remote?.id ?? null, archived_at: now.toISOString(), last_payload_hash: null });
    counts.archived++;
  }
  for (const event of desired) {
    const payload = outlookMirrorPayload(event, calendarId!, assignedUserId, openStatus, completeStatus, now);
    const hash = outlookPayloadHash(payload);
    let link = known.get(event.id);
    if (link?.clickup_task_id && !link.archived_at && link.last_payload_hash === hash) { counts.unchanged++; continue; }
    if (!link) {
      link = { calendar_id: calendarId!, event_id: event.id, clickup_task_id: null, last_payload_hash: null, create_attempted_at: null, archived_at: null };
      await port.save(link, {});
    }
    let remote = await ownedRemote(link);
    if (remote) {
      await port.beforeRequest();
      await port.update(remote.id, { ...payload, assignees: { add: [assignedUserId], rem: [] } });
      counts.updated++;
    } else {
      await port.beforeRequest();
      await port.save(link, { create_attempted_at: now.toISOString() });
      try { remote = await port.create(payload); }
      catch (error) {
        if (error instanceof ClickUpApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
          await port.save(link, { create_attempted_at: null });
        }
        throw error;
      }
      if (!remote?.id) throw new Error("ClickUp has not confirmed the Outlook task ID. Recovery will retry safely.");
      counts.created++;
    }
    await port.save(link, { clickup_task_id: remote.id, last_payload_hash: hash, archived_at: null, last_synced_at: now.toISOString() });
  }
  return counts;
}
