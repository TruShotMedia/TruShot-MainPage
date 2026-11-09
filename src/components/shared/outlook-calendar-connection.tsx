"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarSync, LockKeyhole, RefreshCw, Unplug, X } from "lucide-react";
import { WorkspaceDialog } from "./workspace-dialog";
import { CalendarSubscriptionPanel } from "./calendar-subscription-panel";
import { OUTLOOK_REFRESH_MINUTES, type OutlookCalendarStatus } from "@/lib/outlook-calendar/model";
import "./outlook-calendar.css";

export function OutlookCalendarConnection({ onChanged, compact = false }: { onChanged?: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" aria-label="Outlook calendar" title="Outlook calendar connection" className={`outlook-connect-button${compact ? " is-compact" : ""}`} onClick={() => setOpen(true)}><CalendarSync size={17} />{compact ? null : <span>Outlook calendar</span>}</button>{open ? <ConnectionDialog onClose={() => setOpen(false)} onChanged={onChanged} /> : null}</>;
}
function ConnectionDialog({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const router = useRouter();
  const [calendars, setCalendars] = useState<OutlookCalendarStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [direction, setDirection] = useState<"import" | "export">("import");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/calendar/outlook", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load your calendar connection.");
      setCalendars(result.calendars);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load your calendar connection."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function action(body: Record<string, string>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/calendar/outlook", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update your calendar connection.");
      setCalendars(result.calendars); setConfirmDisconnect(false);
      setMessage(body.action === "disconnect" ? "Disconnected. Outlook itself has not been changed." : body.action === "connect" ? "Connected. Your Outlook events are now available in your calendar." : "Calendar refresh checked.");
      router.refresh(); onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update your calendar connection."); }
    finally { setBusy(false); }
  }
  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void action({ action: "connect", name: String(data.get("calendar_name") ?? ""), url: String(data.get("feed_url") ?? "") });
    // Keep the bearer link out of React state and clear it immediately after use.
    const input = form.elements.namedItem("feed_url");
    if (input instanceof HTMLInputElement) input.value = "";
  }
  return <WorkspaceDialog className="outlook-connection-dialog" titleId="outlook-connection-title" onClose={onClose} busy={busy}
    header={<><div><span><CalendarSync size={15} /> Calendar connections</span><h2 id="outlook-connection-title">Outlook & your workspace</h2><p>Bring Outlook in, or subscribe to your AutoPacific work.</p></div><button type="button" aria-label="Close Outlook connection" onClick={onClose} disabled={busy}><X size={20} /></button></>}
    footer={<><span className="outlook-private-label"><LockKeyhole size={13} /> Private to your login</span><button type="button" onClick={onClose} disabled={busy}>Done</button></>}>
    <div className="outlook-connection-content">
      <div className="calendar-connection-directions" role="group" aria-label="Calendar direction"><button type="button" aria-pressed={direction === "import"} disabled={busy} onClick={() => setDirection("import")}>Outlook → CRM</button><button type="button" aria-pressed={direction === "export"} disabled={busy} onClick={() => setDirection("export")}>Subscribe in Outlook</button></div>
      {direction === "export" ? <CalendarSubscriptionPanel onBusyChange={setBusy} /> : <>
      {loading ? <p role="status">Loading connection…</p> : calendars.length ? calendars.map(calendar => <section className="outlook-status" key={calendar.id}>
        <span className="outlook-source-label">OUTLOOK · READ ONLY</span><h3>{calendar.name}</h3>
        <p>{calendar.event_count} events available · Refreshes about every {OUTLOOK_REFRESH_MINUTES} minutes</p>
        <small>{calendar.last_success_at ? `Last checked ${new Date(calendar.last_success_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}` : "Waiting for the first update"}</small>
        {calendar.last_error ? <p className="outlook-message is-error" role="alert">{calendar.last_error}</p> : null}
        <div className="outlook-connection-actions"><button type="button" disabled={busy} onClick={() => void action({ action: "refresh", id: calendar.id })}><RefreshCw size={15} className={busy ? "spin" : ""} />Refresh now</button><button type="button" disabled={busy} onClick={() => setConfirmDisconnect(true)}><Unplug size={15} />Disconnect</button></div>
        {confirmDisconnect ? <div className="outlook-disconnect-confirm"><p>Remove this calendar and its imported events from this app? Your Outlook calendar will stay unchanged.</p><button type="button" disabled={busy} onClick={() => setConfirmDisconnect(false)}>Keep connected</button><button type="button" disabled={busy} onClick={() => void action({ action: "disconnect", id: calendar.id })}>Disconnect calendar</button></div> : null}
      </section>) : <form onSubmit={connect} className="outlook-connect-form">
        <label>Calendar name<input name="calendar_name" defaultValue="Work Outlook" required maxLength={80} /></label>
        <label>Private ICS subscription link<input name="feed_url" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Paste the ICS link from Outlook" required maxLength={4096} /></label>
        <p>The link is stored securely on the server and is never shown again. Only events and details published by Outlook can appear here.</p>
        <button type="submit" className="admin-primary-button" disabled={busy}>{busy ? "Connecting…" : "Connect Outlook calendar"}</button>
      </form>}
      {error ? <p className="outlook-message is-error" role="alert">{error}</p> : null}
      {message ? <p className="outlook-message" role="status">{message}</p> : null}
      <aside className="outlook-connection-help"><strong>One-way, no duplicates</strong><p>Outlook events cannot be edited here and are not sent to ClickUp or used for CRM push reminders. A cancelled or removed Outlook event disappears after the next successful refresh.</p><p>Times are shown in Brisbane time. The app reads up to a year either side of today, within the date range Outlook publishes. If Outlook is unavailable, your last saved events remain visible.</p><p>Treat your ICS link like a password: anyone who has it can read the details you published.</p></aside>
      </>}
    </div>
  </WorkspaceDialog>;
}
