"use client";

import { useEffect } from "react";

function getAnonymousId() {
  const key = "trushot_analytics_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  });
}

export function AnalyticsTracker() {
  useEffect(() => {
    const anonymousId = getAnonymousId();
    const started = Date.now();
    const deviceClass = window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop";
    const base = { anonymousId, pagePath: window.location.pathname, deviceClass };

    send({ ...base, eventName: "page_view" });

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-analytics-key]");
      if (!target) return;
      send({
        ...base,
        eventName: "cta_click",
        analyticsKey: target.dataset.analyticsKey,
        section: target.closest<HTMLElement>("[data-section]")?.dataset.section,
        packageSlug: target.dataset.packageSlug,
      });
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        send({ ...base, eventName: "heartbeat", properties: { activeSeconds: Math.round((Date.now() - started) / 1000) } });
      }
    }, 30000);

    document.addEventListener("click", onClick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
