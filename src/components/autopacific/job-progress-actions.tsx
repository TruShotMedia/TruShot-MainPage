"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, LockKeyhole, Mail, X } from "lucide-react";
import type { JobProgressAccess, SharedJobProgress } from "@/lib/job-progress-share";
import "./job-progress-actions.css";

type ActiveShare = JobProgressAccess & { token: string };
type Notice = { title: string; description: string; pin?: string; url?: string; error?: boolean };
type Props = { jobId: string; title: string; compact?: boolean; disabled?: boolean; onAccess?: (access: JobProgressAccess) => void };

function progressEndpoint(jobId: string) {
  return `/api/autopacific/jobs/${encodeURIComponent(jobId)}/progress`;
}

async function sharingRequest<T>(jobId: string, action: "share" | "revoke"): Promise<T> {
  const response = await fetch(progressEndpoint(jobId), {
    method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error("Sharing unavailable");
  return response.json() as Promise<T>;
}

export function JobProgressActions({ jobId, title, compact = false, disabled = false, onAccess }: Props) {
  const [busy, setBusy] = useState<"link" | "download" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function announce(next: Notice) {
    if (timer.current) clearTimeout(timer.current);
    setNotice(next);
    if (!next.url) timer.current = setTimeout(() => setNotice(null), 6500);
  }

  async function copyLink() {
    setBusy("link");
    const share = sharingRequest<ActiveShare>(jobId, "share");
    const link = share.then(result => `${window.location.origin}/job-progress#${result.token}`);
    // Safari needs clipboard access inside the click gesture. Supply a
    // promised blob so the PIN and URL still come from the authenticated API.
    let clipboard: Promise<boolean>;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = link.then(url => new Blob([url], { type: "text/plain" }));
        void blob.catch(() => undefined); // Safari can reject the write before consuming the blob.
        clipboard = navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]).then(() => true, () => false);
      } else clipboard = Promise.resolve(false);
    } catch { clipboard = Promise.resolve(false); }
    try {
      const [access, url, wrote] = await Promise.all([share, link, clipboard]);
      onAccess?.({ pin: access.pin, enabled: access.enabled });
      let copied = wrote;
      if (!copied) {
        try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); copied = true; } } catch { /* manual fallback */ }
      }
      announce(copied ? {
        title: "Progress link copied", description: "Send this PIN separately from the link.", pin: access.pin,
      } : { title: "Progress link ready", description: "Clipboard access is unavailable. Select and copy the link below.", pin: access.pin, url });
    } catch {
      announce({ title: "Couldn’t copy the link", description: "Check your connection and try again.", error: true });
    } finally { setBusy(null); }
  }

  async function download() {
    setBusy("download");
    try {
      const [response, { createJobProgressPng }] = await Promise.all([
        fetch(`${progressEndpoint(jobId)}?format=snapshot`, { cache: "no-store" }),
        import("@/lib/job-progress-image"),
      ]);
      if (!response.ok) throw new Error("Image unavailable");
      const { snapshot } = await response.json() as { snapshot: SharedJobProgress };
      const url = URL.createObjectURL(await createJobProgressPng(snapshot));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "job"}-progress.png`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      announce({ title: "Progress image ready", description: "The PNG is ready to attach to an email." });
    } catch {
      announce({ title: "Couldn’t download the image", description: "Check your connection and try again.", error: true });
    } finally { setBusy(null); }
  }

  return <>
    <div className={`job-progress-actions ${compact ? "is-compact" : ""}`}>
      <button type="button" className="job-progress-action" aria-label={`Copy progress link for ${title}`}
        title="Copy PIN-protected progress link" disabled={disabled || busy !== null} onClick={() => void copyLink()}>
        <Mail size={15} aria-hidden="true" />{compact ? null : <span>{busy === "link" ? "Copying…" : "Copy progress link"}</span>}
      </button>
      <button type="button" className="job-progress-action" aria-label={`Download progress image for ${title}`}
        title="Download email-ready progress image" disabled={disabled || busy !== null} onClick={() => void download()}>
        <span className="job-progress-download-icon" aria-hidden="true"><Mail size={15} /><Download size={10} /></span>{compact ? null : <span>{busy === "download" ? "Preparing…" : "Download PNG"}</span>}
      </button>
    </div>
    {notice ? createPortal(<aside className="job-progress-notice">
      <div role={notice.error ? "alert" : "status"} className="job-progress-notice-body">
        {notice.error ? <Mail size={18} /> : <Check size={18} />}
        <div><strong>{notice.title}</strong><p>{notice.description}</p>
          {notice.pin ? <p>Access PIN <code>{notice.pin}</code></p> : null}
          {notice.url ? <input aria-label="Progress link to copy" value={notice.url} readOnly onFocus={event => event.currentTarget.select()} /> : null}
        </div>
      </div>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss progress notification"><X size={16} /></button>
    </aside>, document.body) : null}
  </>;
}

export function JobProgressSharing({ jobId, title, disabled = false }: Props) {
  const [access, setAccess] = useState<JobProgressAccess | null>(null);
  const [message, setMessage] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const version = useRef(0);
  useEffect(() => {
    if (disabled) return;
    const controller = new AbortController();
    const current = ++version.current;
    void fetch(progressEndpoint(jobId), { cache: "no-store", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("PIN unavailable");
        return response.json() as Promise<JobProgressAccess>;
      })
      .then(result => { if (current === version.current && !controller.signal.aborted) setAccess(result); })
      .catch(() => { if (current === version.current && !controller.signal.aborted) setMessage("The PIN is unavailable right now."); });
    return () => controller.abort();
  }, [jobId, disabled]);

  function update(result: JobProgressAccess) {
    version.current++;
    setAccess(result);
    setMessage("");
  }

  async function revoke() {
    setRevoking(true);
    setMessage("");
    try {
      update(await sharingRequest<JobProgressAccess>(jobId, "revoke"));
      setMessage("Access revoked. The old link and PIN won’t work.");
      setConfirm(false);
    } catch { setMessage("Couldn’t revoke access. Please try again."); }
    finally { setRevoking(false); }
  }

  return <section className="job-progress-sharing form-span" aria-label="Job progress sharing">
    <div className="job-progress-sharing-heading"><LockKeyhole size={17} aria-hidden="true" /><div><strong>Share job progress</strong>
      <small>{access?.enabled ? "Link active" : access ? "Sharing off until you copy the link" : "Read-only progress dashboard"}</small></div>
      {!disabled && access ? <div className="job-progress-pin"><span>Access PIN</span><code>{access.pin}</code></div> : null}
    </div>
    <p>Shares the job title, progress and task names and stages. Notes, files and the rest of the CRM stay private.</p>
    <JobProgressActions jobId={jobId} title={title} disabled={disabled || revoking || confirm} onAccess={update} />
    {!disabled && access?.enabled ? <div className="job-progress-revoke">
      {confirm ? <>
        <span>Turn off sharing and replace the old link and PIN?</span>
        <button type="button" disabled={revoking} onClick={() => void revoke()}>{revoking ? "Revoking…" : "Revoke now"}</button>
        <button type="button" disabled={revoking} onClick={() => setConfirm(false)}>Cancel</button>
      </> : <button type="button" onClick={() => setConfirm(true)}>Revoke link</button>}
    </div> : null}
    {disabled || message ? <small role="status">{disabled ? "Connect to the internet to share progress." : message}</small> : null}
  </section>;
}
