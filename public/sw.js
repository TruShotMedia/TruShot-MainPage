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

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/trushot-app-192.png",
    badge: "/icons/trushot-app-192.png",
    tag,
    renotify: true,
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = typeof event.notification.data?.url === "string"
    ? event.notification.data.url
    : "/admin/requests";
  const destination = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existingWindow) {
      await existingWindow.navigate(destination);
      return existingWindow.focus();
    }
    return clients.openWindow(destination);
  })());
});
