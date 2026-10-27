"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { signOutOfAutopacific } from "@/app/autopacific/actions";
import { removePushSubscription } from "@/app/admin/notification-actions";

async function clearFieldCopy(clearQueue = true) {
  window.localStorage.removeItem("autopacific-offline-snapshot:v1");
  if (clearQueue) window.localStorage.removeItem("autopacific-offline-status-queue:v1");
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

export function AutopacificSignOutButton({ showLabel = false }: { showLabel?: boolean }) {
  const [pending, setPending] = useState(false);
  return <button className="tablet-signout-button" type="button" disabled={pending} aria-label="Sign out of AutoPacific" title="Sign out" onClick={async () => {
    try {
      const queue = JSON.parse(window.localStorage.getItem("autopacific-offline-status-queue:v1") ?? "[]");
      if (Array.isArray(queue) && queue.length && !window.confirm("Some field changes have not synced yet. Signing out will discard them. Sign out anyway?")) return;
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
    await signOutOfAutopacific();
  }}>{showLabel ? <><span><LogOut size={18} /></span><strong>Sign out<small>Close this AutoPacific session on this device.</small></strong></> : <LogOut size={16} />}</button>;
}
