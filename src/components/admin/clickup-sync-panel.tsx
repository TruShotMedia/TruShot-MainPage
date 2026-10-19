"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Link2, LoaderCircle, Pause, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { connectClickUpIntegration, setClickUpIntegrationEnabled, syncClickUpIntegration } from "@/app/admin/clickup-actions";

const dateTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Brisbane",
});

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not yet";
}

export type ClickUpPanelIntegration = {
  enabled: boolean;
  list_id: string;
  list_name: string;
  assigned_user_name: string | null;
  status_mapping: Record<string, string>;
  last_connected_at: string | null;
  last_sync_completed_at: string | null;
  last_error: string | null;
} | null;

export function ClickUpSyncPanel({
  configured,
  failedCount,
  integration,
  linkedCount,
  pendingCount,
}: {
  configured: boolean;
  failedCount: number;
  integration: ClickUpPanelIntegration;
  linkedCount: number;
  pendingCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(integration?.last_error ?? "");
  const [messageKind, setMessageKind] = useState<"success" | "error">(integration?.last_error ? "error" : "success");
  const connected = Boolean(integration?.assigned_user_name && integration.last_connected_at);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        setMessageKind(result.ok ? "success" : "error");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The ClickUp request could not be completed.");
        setMessageKind("error");
      }
    });
  }

  const mapping = integration?.status_mapping ?? {
    planning: "TO DO",
    scheduled: "CONTENT CAPTURED",
    production: "EDITING",
    review: "APPROVAL",
    delivered: "COMPLETE",
  };

  return (
    <section className="admin-card settings-section notion-sync-section clickup-sync-section">
      <div>
        <p className="card-label">Integration</p>
        <h2>AutoPacific · ClickUp</h2>
        <p>Mirrors AutoPacific jobs into the APG/Amotiv List. TruShot remains the source of truth; individual CRM tasks are intentionally not copied.</p>
      </div>
      <div className="notion-sync-panel">
        <header>
          <span className={connected && integration?.enabled ? "notion-connection-status is-connected" : "notion-connection-status"}>
            {connected && integration?.enabled ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
            {!configured ? "API token required" : connected ? integration?.enabled ? "Connected and mirroring" : "Connected · paused" : "Ready to connect"}
          </span>
          <div className="clickup-sync-actions">
            {connected ? (
              <button type="button" className="admin-secondary-button" disabled={isPending} onClick={() => run(() => setClickUpIntegrationEnabled(!integration?.enabled))}>
                {integration?.enabled ? <Pause size={15} /> : <Play size={15} />}
                {integration?.enabled ? "Pause" : "Resume"}
              </button>
            ) : null}
            <button type="button" className="admin-secondary-button" disabled={!configured || !connected || !integration?.enabled || isPending} onClick={() => run(syncClickUpIntegration)}>
              {isPending ? <LoaderCircle className="nav-pending" size={15} /> : <RefreshCw size={15} />}
              Sync now
            </button>
            <button type="button" className="admin-primary-button" disabled={!configured || isPending} onClick={() => run(connectClickUpIntegration)}>
              {isPending ? <LoaderCircle className="nav-pending" size={15} /> : <Link2 size={15} />}
              {connected ? "Reconnect" : "Connect ClickUp"}
            </button>
          </div>
        </header>

        <div className="notion-sync-metrics">
          <div><span>Destination</span><strong>{integration?.list_name ?? "APG/Amotiv"}</strong></div>
          <div><span>Assigned profile</span><strong>{integration?.assigned_user_name ?? "Awaiting connection"}</strong></div>
          <div><span>Mirrored jobs</span><strong>{linkedCount}</strong></div>
          <div><span>Queue</span><strong>{pendingCount} pending · {failedCount} failed</strong></div>
          <div><span>Last connection</span><strong>{formatDateTime(integration?.last_connected_at ?? null)}</strong></div>
          <div><span>Last sync</span><strong>{formatDateTime(integration?.last_sync_completed_at ?? null)}</strong></div>
        </div>

        <div className="clickup-status-map" aria-label="ClickUp status mapping">
          {Object.entries(mapping).map(([crmStatus, clickUpStatus]) => (
            <span key={crmStatus}><small>{crmStatus.replaceAll("_", " ")}</small><strong>{clickUpStatus}</strong></span>
          ))}
        </div>

        <p className="notion-sync-explainer">
          <ExternalLink size={15} />
          <a href={`https://app.clickup.com/9003084068/v/l/li/${integration?.list_id ?? "1300350000002054"}`} target="_blank" rel="noreferrer">Open the APG/Amotiv List in ClickUp</a>
          <span>· Creates and edits normally sync just after the CRM response; the scheduled worker safely retries interruptions.</span>
        </p>
        {message ? <p className={`notion-sync-message is-${messageKind}`} role="status">{message}</p> : null}
        {!configured ? <p className="notion-sync-setup-note">Add the private <strong>CLICKUP_API_TOKEN</strong> server variable in Vercel and redeploy. The value is never sent to the browser or stored in Supabase.</p> : null}
      </div>
    </section>
  );
}
