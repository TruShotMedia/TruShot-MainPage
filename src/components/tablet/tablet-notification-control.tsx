"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, BellOff, BellRing, CheckCircle2, LoaderCircle, Send, X } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPushNotification } from "@/app/admin/notification-actions";

type DeviceState = "checking" | "unsupported" | "ready" | "enabled" | "denied";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function TabletNotificationControl({ publicKey }: { publicKey: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deviceState, setDeviceState] = useState<DeviceState>("checking");
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    const inspect = async () => {
      const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
      if (!active) return;
      setIsIOS(ios);
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
    void inspect();
    return () => { active = false; };
  }, [publicKey]);

  useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setIsOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [isOpen]);

  const installRequired = isIOS && !isStandalone;
  const enabled = deviceState === "enabled";

  function enable() {
    startTransition(async () => {
      setMessage("");
      try {
        if (installRequired) throw new Error("Add AutoPacific to your Home Screen first, then enable alerts from the installed app.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setDeviceState(permission === "denied" ? "denied" : "ready");
          throw new Error("Notification permission was not granted.");
        }
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        const createdSubscription = !subscription;
        subscription ??= await registration.pushManager.subscribe({
          applicationServerKey: applicationServerKey(publicKey),
          userVisibleOnly: true,
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
        setMessage("Calendar, flight and client-request alerts are enabled on this device.");
      } catch (error) {
        setMessageKind("error");
        setMessage(errorMessage(error, "Notifications could not be enabled on this device."));
      }
    });
  }

  function disable() {
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
        setMessage("Notifications are disabled on this device.");
      } catch (error) {
        setMessageKind("error");
        setMessage(errorMessage(error, "Notifications could not be disabled."));
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
        setMessage("Test alert sent.");
      } catch (error) {
        setMessageKind("error");
        setMessage(errorMessage(error, "The test alert could not be sent."));
      }
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`tablet-alert-toggle ${enabled ? "is-enabled" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label="AutoPacific notifications"
        aria-expanded={isOpen}
        title={enabled ? "Notifications enabled" : "Set up notifications"}
      >
        <Bell size={15} />
        {enabled ? <i aria-hidden="true" /> : null}
      </button>
      {isOpen ? (
        <section ref={panelRef} className="tablet-notification-panel" aria-label="Notification settings">
          <header>
            <span><BellRing size={16} /> Device notifications</span>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close notification settings"><X size={15} /></button>
          </header>
          <div className="tablet-notification-state">
            {deviceState === "checking" ? <LoaderCircle className="spin" size={17} /> : enabled ? <CheckCircle2 size={17} /> : <Bell size={17} />}
            <div>
              <strong>{deviceState === "checking" ? "Checking this device" : enabled ? "Alerts are active" : installRequired ? "Install the AutoPacific app first" : deviceState === "denied" ? "Permission is blocked" : deviceState === "unsupported" ? "Notifications are unavailable" : "Ready to enable"}</strong>
              <p>Receive client requests, scheduled calendar reminders and flight briefings without keeping this page open.</p>
            </div>
          </div>
          {installRequired ? <p className="tablet-notification-guidance">In Safari, tap Share → <strong>Add to Home Screen</strong>, open AutoPacific, then enable alerts here.</p> : null}
          {deviceState === "denied" ? <p className="tablet-notification-guidance">Allow notifications for AutoPacific in iPhone Settings, then reopen the installed app.</p> : null}
          <div className="tablet-notification-actions">
            {enabled ? <button type="button" onClick={disable} disabled={isPending}><BellOff size={14} /> Disable</button> : <button type="button" className="is-primary" onClick={enable} disabled={isPending || deviceState === "checking" || deviceState === "unsupported" || deviceState === "denied" || installRequired}><BellRing size={14} /> Enable alerts</button>}
            <button type="button" onClick={sendTest} disabled={isPending || !enabled}><Send size={14} /> Send test</button>
          </div>
          {message ? <p className={`tablet-notification-message is-${messageKind}`} role="status">{message}</p> : null}
        </section>
      ) : null}
    </>
  );
}
