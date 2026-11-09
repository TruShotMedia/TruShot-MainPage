"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, KeyRound, Link2, ShieldCheck } from "lucide-react";

type Status = { enabled: boolean; rotated_at: string | null };
export function CalendarSubscriptionPanel({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"replace" | "revoke" | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/calendar/subscription", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load your subscription.");
      setStatus(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load your subscription."); });
    return () => controller.abort();
  }, []);
  async function action(action: "create" | "replace" | "revoke") {
    setBusy(true); onBusyChange?.(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/calendar/subscription", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update your subscription.");
      setStatus({ enabled: result.enabled, rotated_at: result.rotated_at }); setUrl(result.url ?? ""); setConfirmation(null);
      setMessage(action === "revoke" ? "Link revoked. Remove the subscribed calendar in Outlook to clear its saved events." : "Your private link is ready. Copy it before closing this window—it won’t be shown again.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update your subscription."); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage("Link copied. In Outlook, choose Add calendar → Subscribe from web and paste it."); }
    catch { linkInput.current?.focus(); linkInput.current?.select(); setMessage("Select and copy the link, then paste it into Outlook’s Subscribe from web option."); }
  }
  return <section className="calendar-subscription-panel" aria-label="Subscribe in Outlook" aria-busy={busy}>
    <span className="outlook-source-label">AUTOPACIFIC → OUTLOOK · READ ONLY</span>
    <h3>Your work, in Outlook</h3>
    <p>Subscribe to your assigned AutoPacific jobs, task deadlines, events and flights. Changes stay in the CRM; Outlook displays a separate read-only calendar.</p>
    {!status && !error ? <p role="status">Loading subscription…</p> : null}
    {status?.enabled ? <div className="outlook-status"><strong><ShieldCheck size={16} /> Private subscription enabled</strong><small>{status.rotated_at ? `Link created ${new Date(status.rotated_at).toLocaleDateString("en-AU")}` : ""}</small></div> : null}
    {status && !status.enabled ? <div className="outlook-connection-actions"><button type="button" disabled={busy} onClick={() => void action("create")}><Link2 size={16} />Create private subscription link</button></div> : null}
    {url ? <div className="calendar-subscription-link"><label htmlFor="calendar-subscription-url">Private subscription link · shown once</label><input id="calendar-subscription-url" ref={linkInput} type="password" readOnly value={url} autoComplete="off" spellCheck={false} /><div className="outlook-connection-actions"><button type="button" disabled={busy} onClick={() => void copy()}><Copy size={15} />Copy link</button></div></div> : null}
    {status?.enabled ? <div className="outlook-connection-actions"><button type="button" disabled={busy} onClick={() => setConfirmation("replace")}><KeyRound size={15} />Replace link</button><button type="button" disabled={busy} onClick={() => setConfirmation("revoke")}>Revoke access</button></div> : null}
    {confirmation ? <div className="outlook-disconnect-confirm"><p>{confirmation === "replace" ? "The old link will stop working. Remove the old subscribed calendar from Outlook, then subscribe using the new link." : "Stop Outlook from reading this calendar? Previously downloaded events may remain in Outlook until you remove that subscribed calendar."}</p><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button><button type="button" disabled={busy} onClick={() => void action(confirmation)}>{confirmation === "replace" ? "Replace private link" : "Revoke private link"}</button></div> : null}
    {error ? <p className="outlook-message is-error" role="alert">{error}</p> : null}
    {message ? <p className="outlook-message" role="status">{message}</p> : null}
    <aside className="outlook-connection-help"><strong>Connect once</strong><ol><li>Create and copy your private link.</li><li>Open Outlook on the web → Calendar → Add calendar → Subscribe from web.</li><li>Paste the link, name it “AutoPacific”, and save.</li></ol><p>Use Subscribe from web, not Upload from file. Your organisation may restrict calendar subscriptions.</p><strong>Private by design</strong><p>Anyone with this link can read the included titles, dates, locations and basic flight details. Keep it private. Notes, comments, attachments, download links and imported Outlook events are never included.</p><p>Shoots and deadlines appear separately. Undated items are omitted. The calendar covers one year before and after today; times use Brisbane time.</p><p>Outlook controls refresh timing—changes can take more than 24 hours. This does not write to your main Outlook calendar or automatically set Teams availability.</p></aside>
  </section>;
}
