"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, CheckCircle2, LoaderCircle, Send, Smartphone, TriangleAlert } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPushNotification } from "@/app/admin/notification-actions";

type DeviceState = "checking" | "unsupported" | "ready" | "enabled" | "denied";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function getMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function PushNotificationSettings({
  publicKey,
  initialDeviceCount,
}: {
  publicKey: string;
  initialDeviceCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deviceState, setDeviceState] = useState<DeviceState>("checking");
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");

  useEffect(() => {
    let active = true;
    const inspectDevice = async () => {
      const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
      const iOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
      if (!active) return;
      setIsIOS(iOSDevice);
      setIsStandalone(standalone);

      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !publicKey) {
        setDeviceState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setDeviceState("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const subscription = await registration.pushManager.getSubscription();
        if (active) setDeviceState(subscription ? "enabled" : "ready");
      } catch {
        if (active) setDeviceState("unsupported");
      }
    };
    void inspectDevice();
    return () => {
      active = false;
    };
  }, [publicKey]);

  const installRequired = isIOS && !isStandalone;
  const isEnabled = deviceState === "enabled";

  function enableNotifications() {
    startTransition(async () => {
      setMessage("");
      try {
        if (installRequired) throw new Error("Open Share, choose Add to Home Screen, then enable notifications from the installed TruShot app.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setDeviceState(permission === "denied" ? "denied" : "ready");
          throw new Error("Notification permission was not granted.");
        }

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        const createdSubscription = !subscription;
        subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey),
        });
        const serialised = subscription.toJSON();
        if (!serialised.endpoint || !serialised.keys?.p256dh || !serialised.keys.auth) {
          if (createdSubscription) await subscription.unsubscribe();
          throw new Error("The browser returned an incomplete notification subscription.");
        }

        try {
          await savePushSubscription({
            endpoint: serialised.endpoint,
            expirationTime: serialised.expirationTime ?? null,
            keys: serialised.keys,
          });
        } catch (error) {
          if (createdSubscription) await subscription.unsubscribe();
          throw error;
        }

        setDeviceState("enabled");
        setMessageKind("success");
        setMessage("Native alerts are enabled on this device.");
        router.refresh();
      } catch (error) {
        setMessageKind("error");
        setMessage(getMessage(error, "Notifications could not be enabled on this device."));
      }
    });
  }

  function disableNotifications() {
    startTransition(async () => {
      setMessage("");
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await removePushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setDeviceState("ready");
        setMessageKind("success");
        setMessage("Native alerts are disabled on this device.");
        router.refresh();
      } catch (error) {
        setMessageKind("error");
        setMessage(getMessage(error, "Notifications could not be disabled on this device."));
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      setMessage("");
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) throw new Error("Enable notifications on this device first.");
        await sendTestPushNotification(subscription.endpoint);
        setMessageKind("success");
        setMessage("Test alert sent. It should appear as a native notification now.");
      } catch (error) {
        setMessageKind("error");
        setMessage(getMessage(error, "The test alert could not be sent."));
      }
    });
  }

  const unavailable = deviceState === "unsupported" || deviceState === "denied" || installRequired;
  return (
    <section className="admin-card settings-section push-settings-section">
      <div>
        <p className="card-label">Notifications</p>
        <h2>Native business alerts</h2>
        <p>Receive native alerts for client requests and production reminders. Each phone, tablet or computer is enabled separately.</p>
      </div>
      <div className="push-settings-panel">
        <header>
          <span className={`push-device-status is-${isEnabled ? "enabled" : unavailable ? "attention" : "ready"}`}>
            {deviceState === "checking" ? <LoaderCircle className="nav-pending" size={15} /> : isEnabled ? <CheckCircle2 size={15} /> : unavailable ? <TriangleAlert size={15} /> : <BellRing size={15} />}
            {deviceState === "checking" ? "Checking this device" : isEnabled ? "Enabled on this device" : installRequired ? "Install app first" : deviceState === "denied" ? "Permission blocked" : deviceState === "unsupported" ? "Unavailable on this device" : "Ready to enable"}
          </span>
          <span className="push-device-count"><Smartphone size={14} /> {initialDeviceCount} registered {initialDeviceCount === 1 ? "device" : "devices"}</span>
        </header>

        <div className="push-settings-copy">
          <BellRing size={20} />
          <div>
            <strong>Requests and calendar reminders</strong>
            <p>Request alerts open the Client Requests page; timed production alerts open the exact calendar item. Delivery is server scheduled, so the installed app stays light on Supabase and Vercel usage.</p>
          </div>
        </div>

        {installRequired ? <p className="push-guidance">On iPhone, open this page in Safari, tap Share, choose <strong>Add to Home Screen</strong>, open the installed TruShot app, then return here.</p> : null}
        {deviceState === "denied" ? <p className="push-guidance">Allow TruShot notifications in iPhone <strong>Settings → Notifications</strong>, then reopen the installed app.</p> : null}
        {deviceState === "unsupported" && !publicKey ? <p className="push-guidance">Notification delivery is awaiting its production server keys.</p> : null}

        <div className="push-settings-actions">
          {isEnabled ? (
            <button type="button" className="admin-secondary-button" onClick={disableNotifications} disabled={isPending}>
              {isPending ? <LoaderCircle className="nav-pending" size={15} /> : <BellOff size={15} />} Disable on this device
            </button>
          ) : (
            <button type="button" className="admin-primary-button" onClick={enableNotifications} disabled={isPending || unavailable || deviceState === "checking"}>
              {isPending ? <LoaderCircle className="nav-pending" size={15} /> : <BellRing size={15} />} Enable notifications
            </button>
          )}
          <button type="button" className="admin-secondary-button" onClick={sendTest} disabled={isPending || !isEnabled}>
            <Send size={15} /> Send test alert
          </button>
        </div>
        {message ? <p className={`push-settings-message is-${messageKind}`} role="status">{message}</p> : null}
      </div>
    </section>
  );
}
