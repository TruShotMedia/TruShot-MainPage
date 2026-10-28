export type AutopacificOfflineMutation = {
  clientMutationId: string;
  entity: "job" | "task";
  expectedUpdatedAt: string;
  recordId: string;
  statusId: string;
  title: string;
  createdAt: string;
};

const OFFLINE_QUEUE_KEY = "autopacific-offline-status-queue:v1";
const OFFLINE_SNAPSHOT_KEY = "autopacific-offline-snapshot:v1";
function scopedKey(key: string, userId?: string) { return userId ? `${key}:user:${userId}` : key; }
/** Only the configured original videographer may adopt the old single-user queue. */
export function adoptLegacyAutopacificQueue(userId: string) {
  if (!canUseStorage() || readAutopacificOfflineQueue(userId).length) return;
  const legacy = readAutopacificOfflineQueue();
  if (legacy.length) { writeAutopacificOfflineQueue(legacy, userId); window.localStorage.removeItem(OFFLINE_QUEUE_KEY); }
}

function canUseStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function readAutopacificOfflineQueue(userId?: string): AutopacificOfflineMutation[] {
  if (!canUseStorage()) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(scopedKey(OFFLINE_QUEUE_KEY, userId)) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is AutopacificOfflineMutation => (
      Boolean(item)
      && typeof item === "object"
      && (item as { entity?: unknown }).entity !== undefined
      && (((item as { entity?: unknown }).entity === "job") || ((item as { entity?: unknown }).entity === "task"))
      && typeof (item as { recordId?: unknown }).recordId === "string"
      && typeof (item as { statusId?: unknown }).statusId === "string"
      && typeof (item as { expectedUpdatedAt?: unknown }).expectedUpdatedAt === "string"
    ));
  } catch {
    return [];
  }
}

export function writeAutopacificOfflineQueue(queue: AutopacificOfflineMutation[], userId?: string) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(scopedKey(OFFLINE_QUEUE_KEY, userId), JSON.stringify(queue));
}

/**
 * Keep a single intent per record. If a card moves twice offline, only the final
 * destination is replayed, guarded by the revision from before the first move.
 */
export function queueAutopacificOfflineMutation(mutation: Omit<AutopacificOfflineMutation, "clientMutationId" | "createdAt">, userId?: string) {
  const queue = readAutopacificOfflineQueue(userId);
  const existing = queue.find((item) => item.entity === mutation.entity && item.recordId === mutation.recordId);
  const next: AutopacificOfflineMutation = {
    ...mutation,
    clientMutationId: existing?.clientMutationId ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    expectedUpdatedAt: existing?.expectedUpdatedAt ?? mutation.expectedUpdatedAt,
  };
  const compacted = [...queue.filter((item) => item.entity !== mutation.entity || item.recordId !== mutation.recordId), next];
  writeAutopacificOfflineQueue(compacted, userId);
  return compacted;
}

export function removeAutopacificOfflineMutations(clientMutationIds: string[], acknowledged?: AutopacificOfflineMutation[], userId?: string) {
  const ids = new Set(clientMutationIds);
  const queue = readAutopacificOfflineQueue(userId).filter((item) => {
    if (!ids.has(item.clientMutationId)) return true;
    if (!acknowledged) return false;
    const sent = acknowledged.find(entry => entry.clientMutationId === item.clientMutationId);
    // The same record may have been moved again while this request was in flight.
    return !sent || sent.statusId !== item.statusId || sent.expectedUpdatedAt !== item.expectedUpdatedAt;
  });
  writeAutopacificOfflineQueue(queue, userId);
  return queue;
}

/**
 * Stores only the last known, already-authorised AutoPacific payload. It is a
 * companion to the service-worker navigation cache and is never sent elsewhere.
 */
export function writeAutopacificOfflineSnapshot(snapshot: unknown, userId?: string) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(scopedKey(OFFLINE_SNAPSHOT_KEY, userId), JSON.stringify({ savedAt: new Date().toISOString(), snapshot }));
  } catch {
    // Storage pressure should never make the workspace unusable.
  }
}

export function readAutopacificOfflineSnapshot<T>(userId?: string) {
  if (!canUseStorage()) return null as { savedAt: string; snapshot: T } | null;
  try {
    const value = JSON.parse(window.localStorage.getItem(scopedKey(OFFLINE_SNAPSHOT_KEY, userId)) ?? "null") as { savedAt?: unknown; snapshot?: T } | null;
    if (!value || typeof value.savedAt !== "string" || !("snapshot" in value)) return null;
    return { savedAt: value.savedAt, snapshot: value.snapshot as T };
  } catch {
    return null;
  }
}
