"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncNotionImport } from "@/app/admin/actions";

const browserSyncKey = "trushot:notion-sync-requested-at";

export function NotionAutoSync({ enabled, intervalMinutes }: { enabled: boolean; intervalMinutes: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const lastRequestedAt = Number(window.localStorage.getItem(browserSyncKey) ?? 0);
    if (Number.isFinite(lastRequestedAt) && now - lastRequestedAt < intervalMinutes * 60_000) return;
    window.localStorage.setItem(browserSyncKey, String(now));
    let active = true;
    const runSync = () => {
      void syncNotionImport(false).then((result) => {
        if (!active || result.status !== "completed") return;
        const imported = result.created.clients + result.created.jobs + result.created.tasks;
        if (imported > 0) router.refresh();
      }).catch(() => undefined);
    };

    const supportsIdleWork = "requestIdleCallback" in window;
    const scheduleId = supportsIdleWork
      ? window.requestIdleCallback(runSync, { timeout: 2_500 })
      : window.setTimeout(runSync, 650);

    return () => {
      active = false;
      if (supportsIdleWork) window.cancelIdleCallback(scheduleId);
      else window.clearTimeout(scheduleId);
    };
  }, [enabled, intervalMinutes, router]);

  return null;
}
