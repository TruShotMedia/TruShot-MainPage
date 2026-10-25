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

function canUseStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function readAutopacificOfflineQueue(): AutopacificOfflineMutation[] {
  if (!canUseStorage()) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]") as unknown;
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

export function writeAutopacificOfflineQueue(queue: AutopacificOfflineMutation[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Keep a single intent per record. If a card moves twice offline, only the final
 * destination is replayed, guarded by the revision from before the first move.
 */
export function queueAutopacificOfflineMutation(mutation: Omit<AutopacificOfflineMutation, "clientMutationId" | "createdAt">) {
  const queue = readAutopacificOfflineQueue();
  const existing = queue.find((item) => item.entity === mutation.entity && item.recordId === mutation.recordId);
  const next: AutopacificOfflineMutation = {
    ...mutation,
    clientMutationId: existing?.clientMutationId ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    expectedUpdatedAt: existing?.expectedUpdatedAt ?? mutation.expectedUpdatedAt,
  };
  const compacted = [...queue.filter((item) => item.entity !== mutation.entity || item.recordId !== mutation.recordId), next];
  writeAutopacificOfflineQueue(compacted);
  return compacted;
}

export function removeAutopacificOfflineMutations(clientMutationIds: string[]) {
  const ids = new Set(clientMutationIds);
  const queue = readAutopacificOfflineQueue().filter((item) => !ids.has(item.clientMutationId));
  writeAutopacificOfflineQueue(queue);
  return queue;
}

/**
 * Stores only the last known, already-authorised AutoPacific payload. It is a
 * companion to the service-worker navigation cache and is never sent elsewhere.
 */
export function writeAutopacificOfflineSnapshot(snapshot: unknown) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(OFFLINE_SNAPSHOT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), snapshot }));
  } catch {
    // Storage pressure should never make the workspace unusable.
  }
}

export function readAutopacificOfflineSnapshot<T>() {
  if (!canUseStorage()) return null as { savedAt: string; snapshot: T } | null;
  try {
    const value = JSON.parse(window.localStorage.getItem(OFFLINE_SNAPSHOT_KEY) ?? "null") as { savedAt?: unknown; snapshot?: T } | null;
    if (!value || typeof value.savedAt !== "string" || !("snapshot" in value)) return null;
    return { savedAt: value.savedAt, snapshot: value.snapshot as T };
  } catch {
    return null;
  }
}
