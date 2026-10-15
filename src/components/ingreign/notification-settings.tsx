"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, CheckCircle2, LoaderCircle, Send, Smartphone, TriangleAlert } from "lucide-react";
import { removeIngreignPushSubscription, saveIngreignPushSubscription, sendIngreignTestNotification } from "@/app/ingreign/actions";

type DeviceState = "checking" | "unsupported" | "ready" | "enabled" | "denied";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const bytes = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function IngreignNotificationSettings({ publicKey, deviceCount, canConfigure }: { publicKey: string; deviceCount: number; canConfigure: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<DeviceState>("checking");
  const [message, setMessage] = useState("");
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
      if (active) { setIsIOS(ios); setIsStandalone(standalone); }
      if (!canConfigure || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !publicKey) {
        if (active) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") { if (active) setState("denied"); return; }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const subscription = await registration.pushManager.getSubscription();
        if (active) setState(subscription ? "enabled" : "ready");
      } catch {
        if (active) setState("unsupported");
      }
    })();
    return () => { active = false; };
  }, [canConfigure, publicKey]);

  const installRequired = isIOS && !isStandalone;

  function enable() {
    startTransition(async () => {
      try {
        if (installRequired) throw new Error("Add INGREIGN to your Home Screen first, then enable reminders from the installed app.");
        if (await Notification.requestPermission() !== "granted") throw new Error("Notification permission was not granted.");
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
        const serialised = subscription.toJSON();
        if (!serialised.endpoint || !serialised.keys?.p256dh || !serialised.keys.auth) throw new Error("The browser returned an incomplete subscription.");
        await saveIngreignPushSubscription({ endpoint: serialised.endpoint, expirationTime: serialised.expirationTime ?? null, keys: serialised.keys });
        setState("enabled");
        setMessage("Posting reminders are enabled on this device.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Reminders could not be enabled.");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) { await removeIngreignPushSubscription(subscription.endpoint); await subscription.unsubscribe(); }
        setState("ready");
        setMessage("Posting reminders are disabled on this device.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Reminders could not be disabled.");
      }
    });
  }

  function test() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) throw new Error("Enable reminders first.");
        await sendIngreignTestNotification(subscription.endpoint);
        setMessage("Test reminder sent to this device.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The test reminder could not be sent.");
      }
    });
  }

  const enabled = state === "enabled";
  const unavailable = state === "unsupported" || state === "denied" || installRequired;
  return (
    <section className="ingreign-notification-card">
      <header>
        <div className={`ingreign-device-status is-${enabled ? "enabled" : unavailable ? "attention" : "ready"}`}>
          {state === "checking" ? <LoaderCircle className="ingreign-spin" size={17} /> : enabled ? <CheckCircle2 size={17} /> : unavailable ? <TriangleAlert size={17} /> : <BellRing size={17} />}
          <span>{state === "checking" ? "Checking this device" : enabled ? "Enabled on this device" : installRequired ? "Install app first" : state === "denied" ? "Permission blocked" : state === "unsupported" ? "Unavailable here" : "Ready to enable"}</span>
        </div>
        <span><Smartphone size={15} /> {deviceCount} registered {deviceCount === 1 ? "device" : "devices"}</span>
      </header>
      <div className="ingreign-notification-copy"><BellRing size={28} /><div><strong>Never miss a posting day</strong><p>INGREIGN will remind you at 9:00 am on the two-week, one-week, three-day, two-day, one-day and event-day markers.</p></div></div>
      {installRequired ? <p className="ingreign-guidance">On iPhone, open this page in Safari, tap <strong>Share → Add to Home Screen</strong>, then open the installed INGREIGN app.</p> : null}
      {!canConfigure ? <p className="ingreign-guidance">Admin preview mode is read-only for device notifications. Sign in with the dedicated INGREIGN account to register a device.</p> : null}
      <div className="ingreign-notification-actions">
        {enabled ? <button type="button" onClick={disable} disabled={isPending}><BellOff size={16} /> Disable</button> : <button className="is-primary" type="button" onClick={enable} disabled={isPending || unavailable || state === "checking"}><BellRing size={16} /> Enable reminders</button>}
        <button type="button" onClick={test} disabled={isPending || !enabled}><Send size={16} /> Send test</button>
      </div>
      {message ? <p className="ingreign-notification-message" role="status">{message}</p> : null}
    </section>
  );
}

