"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CloudDownload, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { syncNotionImport } from "@/app/admin/actions";
import type { NotionSyncResult } from "@/lib/notion/types";

const dateTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Brisbane",
});

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not yet";
}

export function NotionSyncPanel({
  configured,
  intervalMinutes,
  lastError,
  lastResult,
  lastSuccessfulAt,
  status,
}: {
  configured: boolean;
  intervalMinutes: number;
  lastError: string | null;
  lastResult: NotionSyncResult | null;
  lastSuccessfulAt: string | null;
  status: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(lastError ?? lastResult?.message ?? "");
  const [messageKind, setMessageKind] = useState<"success" | "error">(lastError ? "error" : "success");

  function syncNow() {
    startTransition(async () => {
      try {
        const result = await syncNotionImport(true);
        setMessage(result.message);
        setMessageKind(result.status === "failed" || result.status === "not_configured" ? "error" : "success");
        router.refresh();
      } catch {
        setMessage("The Notion scan could not start. Refresh your admin session and try again.");
        setMessageKind("error");
      }
    });
  }

  const hasMetrics = Boolean(lastResult?.created && lastResult?.linked);
  const createdTotal = hasMetrics && lastResult
    ? lastResult.created.clients + lastResult.created.jobs + lastResult.created.tasks
    : 0;
  const linkedTotal = hasMetrics && lastResult
    ? lastResult.linked.clients + lastResult.linked.jobs + lastResult.linked.tasks
    : 0;

  return (
    <section className="admin-card settings-section notion-sync-section">
      <div>
        <p className="card-label">Integration</p>
        <h2>Notion import</h2>
        <p>Imports missing jobs and tasks from Notion without overwriting CRM edits. A legacy Clients database can be connected optionally.</p>
      </div>
      <div className="notion-sync-panel">
        <header>
          <span className={configured ? "notion-connection-status is-connected" : "notion-connection-status"}>
            {configured ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
            {configured ? "Connection configured" : "Setup required"}
          </span>
          <button type="button" className="admin-primary-button" onClick={syncNow} disabled={!configured || isPending}>
            {isPending ? <LoaderCircle className="nav-pending" size={15} /> : <RefreshCw size={15} />}
            {isPending ? "Scanning Notion…" : "Sync now"}
          </button>
        </header>

        <div className="notion-sync-metrics">
          <div><span>Last successful sync</span><strong>{formatDateTime(lastSuccessfulAt)}</strong></div>
          <div><span>Automatic interval</span><strong>{intervalMinutes} minutes</strong></div>
          <div><span>Last import</span><strong>{createdTotal} created · {linkedTotal} linked</strong></div>
          <div><span>Current state</span><strong>{status || "idle"}</strong></div>
        </div>

        <p className="notion-sync-explainer"><CloudDownload size={15} /> A browser asks for a scan on page load at most once per interval. A database lock prevents duplicate scans across tabs or devices.</p>
        {message ? <p className={`notion-sync-message is-${messageKind}`} role="status">{message}</p> : null}
        {!configured ? <p className="notion-sync-setup-note">Connect the Jobs and Tasks databases, add the three required server variables in Vercel, then redeploy. The token is never exposed to the browser.</p> : null}
      </div>
    </section>
  );
}
