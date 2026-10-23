"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CheckCircle2,
  Eye,
  ExternalLink,
  GitCompareArrows,
  Link2,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  connectClickUpIntegration,
  registerClickUpInboundWebhook,
  resolveClickUpConflict,
  setClickUpInboundMode,
  setClickUpInboundOption,
  setClickUpIntegrationEnabled,
  syncClickUpIntegration,
} from "@/app/admin/clickup-actions";

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
  inbound_mode: "paused" | "observe" | "active";
  import_new_tasks: boolean;
  archive_on_remote_delete: boolean;
  reconciliation_enabled: boolean;
  webhook_id: string | null;
  webhook_health: string | null;
  webhook_fail_count: number;
  last_webhook_received_at: string | null;
  last_reconciled_at: string | null;
} | null;

export type ClickUpConflict = {
  id: string;
  job_id: string | null;
  clickup_task_id: string;
  conflict_type: string;
  changed_fields: string[];
  crm_snapshot: Record<string, unknown> | null;
  clickup_snapshot: Record<string, unknown> | null;
  created_at: string;
  job_title?: string | null;
};

export type ClickUpAuditItem = {
  id: string;
  direction: "inbound" | "outbound" | "system";
  action: string;
  outcome: string;
  detail: string | null;
  created_at: string;
};

function conflictTitle(conflict: ClickUpConflict) {
  return conflict.job_title ?? `ClickUp ${conflict.clickup_task_id}`;
}

export function ClickUpSyncPanel({
  audit,
  configured,
  conflicts,
  failedCount,
  inboundFailedCount,
  inboundPendingCount,
  integration,
  linkedCount,
  pendingCount,
  webhookEncryptionConfigured,
}: {
  audit: ClickUpAuditItem[];
  configured: boolean;
  conflicts: ClickUpConflict[];
  failedCount: number;
  inboundFailedCount: number;
  inboundPendingCount: number;
  integration: ClickUpPanelIntegration;
  linkedCount: number;
  pendingCount: number;
  webhookEncryptionConfigured: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(integration?.last_error ?? "");
  const [messageKind, setMessageKind] = useState<"success" | "error">(integration?.last_error ? "error" : "success");
  const connected = Boolean(integration?.assigned_user_name && integration.last_connected_at);
  const webhookReady = Boolean(integration?.webhook_id);

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
        <p>Safely mirrors AutoPacific jobs with John / Jobs. TruShot-only finance and production fields remain protected from ClickUp edits.</p>
      </div>
      <div className="notion-sync-panel">
        <header>
          <span className={connected && integration?.enabled ? "notion-connection-status is-connected" : "notion-connection-status"}>
            {connected && integration?.enabled ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
            {!configured ? "API token required" : connected ? integration?.enabled ? "Outbound connected" : "Outbound paused" : "Ready to connect"}
          </span>
          <div className="clickup-sync-actions">
            {connected ? (
              <button type="button" className="admin-secondary-button" disabled={isPending} onClick={() => run(() => setClickUpIntegrationEnabled(!integration?.enabled))}>
                {integration?.enabled ? <Pause size={15} /> : <Play size={15} />}
                {integration?.enabled ? "Pause outbound" : "Resume outbound"}
              </button>
            ) : null}
            <button type="button" className="admin-secondary-button" disabled={!configured || !connected || isPending} onClick={() => run(syncClickUpIntegration)}>
              {isPending ? <LoaderCircle className="nav-pending" size={15} /> : <RefreshCw size={15} />}
              Reconcile now
            </button>
            <button type="button" className="admin-primary-button" disabled={!configured || isPending} onClick={() => run(connectClickUpIntegration)}>
              {isPending ? <LoaderCircle className="nav-pending" size={15} /> : <Link2 size={15} />}
              {connected ? "Reconnect" : "Connect ClickUp"}
            </button>
          </div>
        </header>

        <div className="notion-sync-metrics">
          <div><span>Destination</span><strong>John / {integration?.list_name ?? "Jobs"}</strong></div>
          <div><span>Assigned profile</span><strong>{integration?.assigned_user_name ?? "Awaiting connection"}</strong></div>
          <div><span>Mirrored jobs</span><strong>{linkedCount}</strong></div>
          <div><span>Outbound queue</span><strong>{pendingCount} pending · {failedCount} failed</strong></div>
          <div><span>Inbound queue</span><strong>{inboundPendingCount} pending · {inboundFailedCount} failed</strong></div>
          <div><span>Open conflicts</span><strong>{conflicts.length}</strong></div>
          <div><span>Last outbound</span><strong>{formatDateTime(integration?.last_sync_completed_at ?? null)}</strong></div>
          <div><span>Last webhook</span><strong>{formatDateTime(integration?.last_webhook_received_at ?? null)}</strong></div>
        </div>

        <div className="clickup-status-map" aria-label="ClickUp status mapping">
          {Object.entries(mapping).map(([crmStatus, clickUpStatus]) => (
            <span key={crmStatus}><small>{crmStatus.replaceAll("_", " ")}</small><strong>{clickUpStatus}</strong></span>
          ))}
        </div>

        <div className="clickup-bidirectional-panel">
          <div className="clickup-bidirectional-heading">
            <div><p className="card-label">Inbound protection</p><h3>ClickUp → TruShot</h3><p>Choose how incoming ClickUp changes are handled. Observation mode records events without changing CRM data.</p></div>
            <span className={`clickup-mode-badge is-${integration?.inbound_mode ?? "paused"}`}>
              {integration?.inbound_mode === "active" ? <ArrowLeftRight size={14} /> : integration?.inbound_mode === "observe" ? <Eye size={14} /> : <Pause size={14} />}
              {integration?.inbound_mode ?? "paused"}
            </span>
          </div>

          <div className="clickup-mode-actions" role="group" aria-label="Inbound ClickUp mode">
            <button type="button" className={integration?.inbound_mode === "paused" ? "is-selected" : ""} disabled={!connected || isPending} onClick={() => run(() => setClickUpInboundMode("paused"))}><Pause size={15} /> Paused</button>
            <button type="button" className={integration?.inbound_mode === "observe" ? "is-selected" : ""} disabled={!connected || !webhookReady || isPending} onClick={() => run(() => setClickUpInboundMode("observe"))}><Eye size={15} /> Observe</button>
            <button type="button" className={integration?.inbound_mode === "active" ? "is-selected" : ""} disabled={!connected || !webhookReady || isPending} onClick={() => run(() => setClickUpInboundMode("active"))}><ArrowLeftRight size={15} /> Active</button>
          </div>

          <div className="clickup-safety-grid">
            <button type="button" className={integration?.import_new_tasks ? "is-enabled" : ""} disabled={!connected || isPending} onClick={() => run(() => setClickUpInboundOption("import_new_tasks", !integration?.import_new_tasks))}>
              <ShieldCheck size={18} /><span><strong>Import new assigned tasks</strong><small>{integration?.import_new_tasks ? "Enabled" : "Disabled by default"}</small></span>
            </button>
            <button type="button" className={integration?.archive_on_remote_delete ? "is-enabled" : ""} disabled={!connected || isPending} onClick={() => run(() => setClickUpInboundOption("archive_on_remote_delete", !integration?.archive_on_remote_delete))}>
              <RotateCcw size={18} /><span><strong>Archive remote deletions</strong><small>{integration?.archive_on_remote_delete ? "Enabled" : "Send to review"}</small></span>
            </button>
            <button type="button" className={integration?.reconciliation_enabled ? "is-enabled" : ""} disabled={!connected || isPending} onClick={() => run(() => setClickUpInboundOption("reconciliation_enabled", !integration?.reconciliation_enabled))}>
              <RefreshCw size={18} /><span><strong>Safety reconciliation</strong><small>{integration?.reconciliation_enabled ? "Every 15 minutes" : "Paused"}</small></span>
            </button>
          </div>

          <div className="clickup-webhook-row">
            <span><ShieldCheck size={16} /><strong>Signed webhook</strong><small>{webhookReady ? `${integration?.webhook_health ?? "registered"} · ${integration?.webhook_fail_count ?? 0} failures` : "Not registered"}</small></span>
            <button type="button" className="admin-secondary-button" disabled={!connected || !webhookEncryptionConfigured || isPending} onClick={() => run(registerClickUpInboundWebhook)}>{webhookReady ? "Verify webhook" : "Register webhook"}</button>
          </div>
          {!webhookEncryptionConfigured ? <p className="notion-sync-setup-note">Add the private <strong>CLICKUP_WEBHOOK_ENCRYPTION_KEY</strong> server variable in Vercel and redeploy before registering inbound syncing.</p> : null}
        </div>

        {conflicts.length ? (
          <div className="clickup-conflicts">
            <div><p className="card-label">Review queue</p><h3>Choose the correct version</h3></div>
            {conflicts.map((conflict) => (
              <article key={conflict.id}>
                <GitCompareArrows size={18} />
                <div><strong>{conflictTitle(conflict)}</strong><span>{conflict.changed_fields.join(" · ") || conflict.conflict_type.replaceAll("_", " ")}</span><small>{formatDateTime(conflict.created_at)}</small></div>
                <div className="clickup-conflict-actions">
                  <button type="button" disabled={isPending} onClick={() => run(() => resolveClickUpConflict(conflict.id, "crm"))}>Use TruShot</button>
                  <button type="button" disabled={isPending} onClick={() => run(() => resolveClickUpConflict(conflict.id, "clickup"))}>Use ClickUp</button>
                  <button type="button" disabled={isPending} onClick={() => run(() => resolveClickUpConflict(conflict.id, "dismissed"))}>Dismiss</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {audit.length ? (
          <details className="clickup-audit">
            <summary>Recent sync activity</summary>
            <div>{audit.map((item) => <p key={item.id}><span className={`is-${item.outcome}`}>{item.outcome}</span><strong>{item.direction} · {item.action}</strong><small>{item.detail} · {formatDateTime(item.created_at)}</small></p>)}</div>
          </details>
        ) : null}

        <p className="notion-sync-explainer">
          <ExternalLink size={15} />
          <a href={`https://app.clickup.com/9003084068/v/l/li/${integration?.list_id ?? "1300350000002054"}`} target="_blank" rel="noreferrer">Open John / Jobs in ClickUp</a>
          <span>· Shared fields are title, status, start and due date. Finance, invoices, hours and production metadata remain owned by TruShot.</span>
        </p>
        {message ? <p className={`notion-sync-message is-${messageKind}`} role="status">{message}</p> : null}
        {!configured ? <p className="notion-sync-setup-note">Add the private <strong>CLICKUP_API_TOKEN</strong> server variable in Vercel and redeploy. The value is never sent to the browser or stored in Supabase.</p> : null}
      </div>
    </section>
  );
}
