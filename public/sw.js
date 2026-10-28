/* global self, clients */

const AUTOPACIFIC_FIELD_CACHE = "autopacific-field-shell-v1";

async function serveAutopacificNavigation(request) {
  const cache = await caches.open(AUTOPACIFIC_FIELD_CACHE);
  try {
    const live = await fetch(request);
    // Never turn a redirected sign-in response into the field fallback. A
    // cached workspace is only useful after this exact app route succeeded.
    const livePath = new URL(live.url).pathname;
    if (live.ok && (livePath === "/autopacific" || livePath === "/autopacific/mobile" || livePath === "/marketing")) {
      await cache.put(request, live.clone());
    } else if (livePath === "/autopacific/login" || livePath === "/marketing/login" || livePath === "/autopacific/security" || live.status === 401 || live.status === 403) {
      await caches.delete(AUTOPACIFIC_FIELD_CACHE);
    }
    return live;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("AutoPacific has not been opened on this device while online yet.");
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname !== "/autopacific" && url.pathname !== "/autopacific/mobile" && url.pathname !== "/marketing") return;
  // Always prefer the network. The cached page is an offline-only field copy,
  // never a source of truth when a live connection is available.
  event.respondWith(serveAutopacificNavigation(request));
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }

  const title = typeof message.title === "string" ? message.title : "TruShot Media";
  const body = typeof message.body === "string" ? message.body : "There is an update in your CRM.";
  const url = typeof message.url === "string" && message.url.startsWith("/")
    ? message.url
    : "/admin/requests";
  const tag = typeof message.tag === "string" ? message.tag : "trushot-update";
  const timestamp = typeof message.timestamp === "number" ? message.timestamp : Date.now();
  const kind = message.kind === "flight"
    ? "flight"
    : message.kind === "autopacific"
      ? "autopacific"
      : message.kind === "ingreign"
        ? "ingreign"
        : message.kind === "lifestyle"
          ? "lifestyle"
          : "default";
  const notificationIcon = kind === "ingreign"
    ? "/ingreign/icon-192.png"
    : kind === "lifestyle"
      ? "/lifestyle/icons/192"
    : kind === "flight" || kind === "autopacific"
      ? "/autopacific/icons/192"
      : "/icons/trushot-app-192.png";
  const badgeCount = Number.isFinite(message.badgeCount) && message.badgeCount > 0
    ? Math.floor(message.badgeCount)
    : null;

  event.waitUntil((async () => {
    const operations = [self.registration.showNotification(title, {
      body,
      icon: notificationIcon,
      badge: notificationIcon,
      tag,
      timestamp,
      renotify: true,
      lang: "en-AU",
      data: { kind, url },
    })];
    if (badgeCount && "setAppBadge" in self.navigator) {
      operations.push(self.navigator.setAppBadge(badgeCount));
    }
    await Promise.allSettled(operations);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = typeof event.notification.data?.url === "string"
    ? event.notification.data.url
    : "/admin/requests";
  const destination = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    if ("clearAppBadge" in self.navigator) {
      await self.navigator.clearAppBadge().catch(() => undefined);
    }
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existingWindow) {
      await existingWindow.navigate(destination);
      return existingWindow.focus();
    }
    return clients.openWindow(destination);
  })());
});
