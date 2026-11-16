"use client";

import { useCallback, useSyncExternalStore } from "react";
import { todayDateInput } from "@/lib/format";

function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  function checkDay() {
    onChange();
    clearTimeout(timer);
    // Calendar dates use Brisbane time (UTC+10, with no daylight-saving shift).
    const nextMidnight = Date.parse(`${todayDateInput()}T00:00:00+10:00`) + 86_400_000;
    timer = setTimeout(checkDay, Math.max(1, nextMidnight - Date.now()));
  }
  const onVisible = () => { if (document.visibilityState === "visible") checkDay(); };
  checkDay();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", checkDay);
  window.addEventListener("pageshow", checkDay);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", checkDay);
    window.removeEventListener("pageshow", checkDay);
  };
}

/** Hydrate with the server date, then keep today current across midnight and app sleep.
 * The snapshot changes only once per day; no requests or minute-by-minute renders. */
export function useCalendarToday(initialToday: string) {
  const serverSnapshot = useCallback(() => initialToday, [initialToday]);
  return useSyncExternalStore(subscribe, todayDateInput, serverSnapshot);
}
