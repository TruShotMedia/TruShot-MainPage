"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { queueAutopacificOfflineMutation, readAutopacificOfflineQueue, removeAutopacificOfflineMutations, type AutopacificOfflineMutation } from "@/lib/autopacific-offline";

/** The same revision-guarded queue is used by the kiosk and the mobile workspace. */
export function useProductionFieldMode() {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<AutopacificOfflineMutation[]>([]);
  const [message, setMessage] = useState("");
  const syncing = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); setQueue(readAutopacificOfflineQueue()); };
    const timer = window.setTimeout(update, 0);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const queueMove = useCallback((entity: "job" | "task", mutation: Omit<AutopacificOfflineMutation, "clientMutationId" | "createdAt" | "entity">) => {
    // Throw if storage is unavailable so the calling board restores the card.
    setQueue(queueAutopacificOfflineMutation({ entity, ...mutation }));
    setMessage("Your field changes will sync when reception returns.");
  }, []);
  const sync = useCallback(async () => {
    if (syncing.current) return syncing.current;
    if (!navigator.onLine) return false;
    const pending = readAutopacificOfflineQueue();
    if (!pending.length) return true;
    const run = async () => {
      try {
        const response = await fetch("/api/autopacific/offline-sync", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutations: pending }) });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.results)) throw new Error("Sync unavailable");
        const settled = payload.results.filter((result: { status: string }) => result.status === "synced" || result.status === "conflict");
        const remaining = removeAutopacificOfflineMutations(settled.map((result: { clientMutationId: string }) => result.clientMutationId), pending);
        setQueue(remaining);
        const conflicts = settled.filter((result: { status: string }) => result.status === "conflict").length;
        setMessage(conflicts ? "Some records changed while you were offline. The newer live versions were kept." : remaining.length ? "Some field changes still need to sync. Your saved changes are safe." : "Your field changes are now up to date.");
        return true;
      } catch { setMessage("Your field changes are safely queued. Refresh to retry when reception returns."); return false; }
    };
    syncing.current = run();
    try { return await syncing.current; } finally { syncing.current = null; }
  }, []);
  return { online, queue, message, queueMove, sync };
}
