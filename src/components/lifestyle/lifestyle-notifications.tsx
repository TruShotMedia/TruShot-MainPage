"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, CheckCircle2, LoaderCircle, Send, Smartphone, TriangleAlert } from "lucide-react";
import { removeLifestylePushSubscription, saveLifestylePushSubscription, sendLifestyleTestNotification } from "@/app/lifestyle/actions";

type DeviceState = "checking" | "unsupported" | "ready" | "enabled" | "denied";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const bytes = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function LifestyleNotifications({ publicKey, deviceCount }: { publicKey: string; deviceCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<DeviceState>("checking");
  const [message, setMessage] = useState("");
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const nav = navigator as Navigator & { standalone?: boolean; clearAppBadge?: () => Promise<void> };
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
      if (active) { setIsIOS(ios); setIsStandalone(standalone); }
      void nav.clearAppBadge?.().catch(() => undefined);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !publicKey) {
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
  }, [publicKey]);

  const installRequired = isIOS && !isStandalone;
  const enabled = state === "enabled";
  const unavailable = state === "unsupported" || state === "denied" || installRequired;

  function enable() {
    startTransition(async () => {
      try {
        if (installRequired) throw new Error("Add Lifestyle to your Home Screen first, then enable reminders inside the installed app.");
        if (await Notification.requestPermission() !== "granted") throw new Error("Notification permission was not granted.");
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
        const serialised = subscription.toJSON();
        if (!serialised.endpoint || !serialised.keys?.p256dh || !serialised.keys.auth) throw new Error("The browser returned an incomplete subscription.");
        await saveLifestylePushSubscription({ endpoint: serialised.endpoint, expirationTime: serialised.expirationTime ?? null, keys: serialised.keys });
        setState("enabled");
        setMessage("Daily gym and hydration reminders are enabled on this device.");
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
        if (subscription) { await removeLifestylePushSubscription(subscription.endpoint); await subscription.unsubscribe(); }
        setState("ready");
        setMessage("Gym reminders are disabled on this device.");
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
        await sendLifestyleTestNotification(subscription.endpoint);
        setMessage("A test nudge is on its way.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The test reminder could not be sent.");
      }
    });
  }

  return (
    <section className="lifestyle-notification-card">
      <header>
        <div className={`lifestyle-device-state is-${enabled ? "enabled" : unavailable ? "attention" : "ready"}`}>
          {state === "checking" ? <LoaderCircle className="lifestyle-spin" size={17} /> : enabled ? <CheckCircle2 size={17} /> : unavailable ? <TriangleAlert size={17} /> : <BellRing size={17} />}
          <span>{state === "checking" ? "Checking this device" : enabled ? "Enabled here" : installRequired ? "Install app first" : state === "denied" ? "Permission blocked" : state === "unsupported" ? "Unavailable here" : "Ready to enable"}</span>
        </div>
        <span><Smartphone size={15} /> {deviceCount} {deviceCount === 1 ? "device" : "devices"}</span>
      </header>
      <div className="lifestyle-notification-copy">
        <span><BellRing size={24} /></span>
        <div><strong>Friendly accountability</strong><p>Receive a daily gym check-in plus two varied hydration nudges. Each new Lifestyle reminder replaces the previous one instead of stacking.</p></div>
      </div>
      {installRequired ? <p className="lifestyle-guidance">On iPhone, use Safari → Share → <strong>Add to Home Screen</strong>, then open Lifestyle from its icon.</p> : null}
      <div className="lifestyle-notification-actions">
        {enabled ? <button type="button" onClick={disable} disabled={isPending}><BellOff size={16} /> Disable</button> : <button className="is-primary" type="button" onClick={enable} disabled={isPending || unavailable || state === "checking"}><BellRing size={16} /> Enable reminders</button>}
        <button type="button" onClick={test} disabled={isPending || !enabled}><Send size={16} /> Test the sass</button>
      </div>
      {message ? <p className="lifestyle-notification-message" role="status">{message}</p> : null}
    </section>
  );
}
