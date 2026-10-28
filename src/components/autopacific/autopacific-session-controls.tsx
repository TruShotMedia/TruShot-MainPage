"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { signOutOfAutopacific } from "@/app/autopacific/actions";
import { removePushSubscription } from "@/app/admin/notification-actions";

async function clearFieldCopy(clearQueue = true) {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("autopacific-offline-snapshot:") || (clearQueue && key.startsWith("autopacific-offline-status-queue:"))) window.localStorage.removeItem(key);
  }
  if ("caches" in window) await caches.delete("autopacific-field-shell-v1");
}

export function AutopacificLoginCleanup() {
  useEffect(() => {
    void clearFieldCopy(false).catch(() => undefined);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => subscription?.unsubscribe()).catch(() => undefined);
  }, []);
  return null;
}

/** Preserve unsynced changes, but never keep an offline shell behind an MFA challenge. */
export function AutopacificMfaLocalCleanup() {
  useEffect(() => { void clearFieldCopy(false).catch(() => undefined); }, []);
  return null;
}

export function AutopacificSignOutButton({ destination = "/autopacific", showLabel = false }: { destination?: string; showLabel?: boolean }) {
  const [pending, setPending] = useState(false);
  return <button className="tablet-signout-button" type="button" disabled={pending} aria-label="Sign out of AutoPacific" title="Sign out" onClick={async () => {
    try {
      const pending = Object.keys(window.localStorage).filter(key => key.startsWith("autopacific-offline-status-queue:")).some(key => {
        const queue = JSON.parse(window.localStorage.getItem(key) ?? "[]"); return Array.isArray(queue) && queue.length;
      });
      if (pending && !window.confirm("Some field changes have not synced yet. Signing out will discard them. Sign out anyway?")) return;
    } catch { /* Unavailable storage must not prevent signing out. */ }
    setPending(true);
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          try { await removePushSubscription(subscription.endpoint); }
          finally { await subscription.unsubscribe(); }
        }
      } catch {
        // The next login also disconnects a stale browser subscription, and
        // notification setup verifies server ownership before showing enabled.
      }
    }
    try { await clearFieldCopy(); } catch { /* Sign out even if device storage is unavailable. */ }
    await signOutOfAutopacific(destination);
  }}>{showLabel ? <><span><LogOut size={18} /></span><strong>Sign out<small>Close this AutoPacific session on this device.</small></strong></> : <LogOut size={16} />}</button>;
}
