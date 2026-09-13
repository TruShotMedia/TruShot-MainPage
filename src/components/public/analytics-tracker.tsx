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

const ATTRIBUTION_KEY = "trushot_attribution";

function getAttribution(deviceClass: "mobile" | "tablet" | "desktop") {
  const existing = window.localStorage.getItem(ATTRIBUTION_KEY);
  if (existing) {
    try { return JSON.parse(existing) as Record<string, unknown>; } catch { /* replace malformed local data */ }
  }
  const search = new URLSearchParams(window.location.search);
  let referrerDomain = "";
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.hostname !== window.location.hostname) referrerDomain = referrer.hostname;
  } catch { /* discard malformed referrer */ }
  const utm = Object.fromEntries(["source", "medium", "campaign", "term", "content"]
    .map((key) => [key, search.get(`utm_${key}`)?.slice(0, 180) ?? ""])
    .filter(([, value]) => value));
  const attribution = {
    landing_path: `${window.location.pathname}${window.location.search}`.slice(0, 300),
    referrer_domain: referrerDomain || null,
    device_class: deviceClass,
    utm,
    first_seen_at: new Date().toISOString(),
  };
  window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  return attribution;
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
    const attribution = getAttribution(deviceClass);
    const base = { anonymousId, pagePath: window.location.pathname, deviceClass, attribution };

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

    let formStarted = false;
    const onFocus = (event: FocusEvent) => {
      if (formStarted || !(event.target as HTMLElement).closest(".enquiry-form")) return;
      formStarted = true;
      send({ ...base, eventName: "form_start", section: "enquiry" });
    };

    const onChange = (event: Event) => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[data-analytics-package]");
      if (!select) return;
      const option = select.selectedOptions[0];
      send({ ...base, eventName: "package_select", section: "enquiry", packageSlug: option?.dataset.packageSlug });
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        send({ ...base, eventName: "heartbeat", properties: { activeSeconds: Math.round((Date.now() - started) / 1000) } });
      }
    }, 30000);

    document.addEventListener("click", onClick);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("change", onChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("click", onClick);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("change", onChange);
    };
  }, []);

  return null;
}
