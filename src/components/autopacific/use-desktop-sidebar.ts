"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const preferenceEvent = "apg-sidebar-preference-change";
const serverSnapshot = () => false;

export function useDesktopSidebar(key: string) {
  const [fallback, setFallback] = useState<{ key: string; collapsed: boolean } | null>(null);
  const snapshot = useCallback(() => {
    try { return window.localStorage.getItem(key) === "collapsed"; } catch { return false; }
  }, [key]);
  const subscribe = useCallback((onChange: () => void) => {
    const changed = (event: StorageEvent) => { if (event.key === null || event.key === key) onChange(); };
    const localChanged = (event: Event) => { if ((event as CustomEvent<string>).detail === key) onChange(); };
    window.addEventListener("storage", changed);
    window.addEventListener(preferenceEvent, localChanged);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener(preferenceEvent, localChanged);
    };
  }, [key]);
  const saved = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const collapsed = fallback?.key === key ? fallback.collapsed : saved;
  function setCollapsed(value: boolean) {
    try {
      window.localStorage.setItem(key, value ? "collapsed" : "expanded");
      setFallback(null);
      window.dispatchEvent(new CustomEvent(preferenceEvent, { detail: key }));
    } catch { setFallback({ key, collapsed: value }); }
  }
  return [collapsed, setCollapsed] as const;
}
