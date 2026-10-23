/* global self, clients */

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
        : "default";
  const notificationIcon = kind === "ingreign"
    ? "/ingreign/icon-192.png"
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
