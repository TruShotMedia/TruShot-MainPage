"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileDown, LoaderCircle, X } from "lucide-react";

type SelectedJob = { id: string; clientId: string | null; clientName: string | null };

export function JobExportDialog({ jobs, disabled = false }: { jobs: SelectedJob[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [includePricing, setIncludePricing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const clientIds = new Set(jobs.map((job) => job.clientId ?? ""));
  const mixedClients = clientIds.size > 1;
  const clientName = jobs[0]?.clientName ?? "Unassigned work";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  async function exportReport() {
    if (!jobs.length || mixedClients || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/jobs/export", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: jobs.map((job) => job.id), includePricing }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "The PDF could not be generated. Please try again.");
      }
      const blob = await response.blob();
      if (blob.type !== "application/pdf" || !blob.size) {
        throw new Error("The export did not return a valid PDF. Please try again.");
      }
      const fileName = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]
        ?? "trushot-work-report.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The PDF could not be generated. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="admin-primary-button status-bulk-export-button" disabled={!jobs.length || disabled}
        onClick={() => { setError(""); setIncludePricing(false); setOpen(true); }}>
        <FileDown size={15} /> Export PDF
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="job-export-layer" role="presentation">
          <button type="button" className="job-export-backdrop" aria-label="Close export options"
            onClick={() => { if (!pending) setOpen(false); }} />
          <section className="job-export-dialog" role="dialog" aria-modal="true" aria-labelledby="job-export-title">
            <header>
              <span className="job-export-icon"><FileDown size={23} /></span>
              <button type="button" aria-label="Close export options" className="job-export-close"
                disabled={pending} onClick={() => setOpen(false)}><X size={18} /></button>
            </header>
            <span className="job-export-eyebrow">Client work report</span>
            <h2 id="job-export-title">Show the work behind the value.</h2>
            <p className="job-export-intro">A polished PDF with every selected job, its assets and recorded hours. Choose whether to share allocated pricing.</p>
            <div className="job-export-selection">
              <span><strong>{jobs.length}</strong><small>{jobs.length === 1 ? "job selected" : "jobs selected"}</small></span>
              <span><strong>{mixedClients ? "Multiple clients" : clientName}</strong><small>Report recipient</small></span>
            </div>
            {mixedClients ? <p className="job-export-error" role="alert">Select jobs for one client at a time. This prevents another client&apos;s work from appearing in their report.</p> : null}
            <fieldset className="job-export-options">
              <legend>Pricing in this report</legend>
              <label className={!includePricing ? "is-selected" : ""}>
                <input type="radio" name="job-export-pricing" checked={!includePricing} onChange={() => setIncludePricing(false)} />
                <span><strong>Without pricing</strong><small>Share the work first, then negotiate a price.</small></span>
                {!includePricing ? <Check size={17} aria-hidden="true" /> : null}
              </label>
              <label className={includePricing ? "is-selected" : ""}>
                <input type="radio" name="job-export-pricing" checked={includePricing} onChange={() => setIncludePricing(true)} />
                <span><strong>Include allocated pricing</strong><small>Show each job&apos;s value from its linked invoice(s).</small></span>
                {includePricing ? <Check size={17} aria-hidden="true" /> : null}
              </label>
            </fieldset>
            {includePricing ? <p className="job-export-note">Jobs without a valid invoice allocation are marked “Not allocated”, never priced at $0. This is a work report, not an invoice or quote.</p> : null}
            {error ? <p className="job-export-error" role="alert">{error}</p> : null}
            <footer>
              <button type="button" className="admin-secondary-button" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="admin-primary-button" disabled={mixedClients || pending || disabled}
                onClick={() => { void exportReport(); }}>
                {pending ? <LoaderCircle size={17} className="job-export-spin" /> : <FileDown size={17} />}
                {pending ? "Preparing PDF…" : "Download report"}
              </button>
            </footer>
          </section>
        </div>, document.body) : null}
    </>
  );
}
