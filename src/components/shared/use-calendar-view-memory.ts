"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { parseCalendarViewMemory, type CalendarViewMemory, type CalendarViewMode } from "@/lib/calendar-view-memory";

const preferenceEvent = "calendar-view-preference-change";
const serverSnapshot = () => null;

/** Restore after hydration without writing a default over the saved view.
 * Save only on interaction, and never turn storage failures into UI failures. */
export function useCalendarViewMemory(key: string | null, today: string, defaultMode: CalendarViewMode) {
  const [fallback, setFallback] = useState<{ key: string | null; value: CalendarViewMemory } | null>(null);
  const snapshot = useCallback(() => {
    if (!key) return null;
    try { return window.localStorage.getItem(key); } catch { return null; }
  }, [key]);
  const subscribe = useCallback((onChange: () => void) => {
    if (!key) return () => {};
    const changed = (event: StorageEvent) => { if (event.key === null || event.key === key) onChange(); };
    const localChanged = (event: Event) => { if ((event as CustomEvent<string>).detail === key) onChange(); };
    window.addEventListener("storage", changed);
    window.addEventListener(preferenceEvent, localChanged);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener(preferenceEvent, localChanged);
    };
  }, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const value = fallback?.key === key ? fallback.value : parseCalendarViewMemory(raw, today, defaultMode);

  function update(patch: Partial<CalendarViewMemory>) {
    const next = { ...value, ...patch };
    if (key) {
      try {
        window.localStorage.setItem(key, JSON.stringify({ version: 1, ...next }));
        setFallback(null);
        window.dispatchEvent(new CustomEvent(preferenceEvent, { detail: key }));
        return;
      } catch { /* Private browsing/quota: the current calendar still works. */ }
    }
    setFallback({ key, value: next });
  }
  return [value, update] as const;
}
