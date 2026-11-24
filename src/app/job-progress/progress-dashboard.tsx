"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowRight, Check, Circle, Download, ExternalLink, FileText, LockKeyhole, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { jobProgressBrand } from "@/lib/job-progress-brand";
import { jobWorkflow, type ClientJobProgress, type ProgressFileAction } from "@/lib/job-progress-share";

type OpenAttachment = (id: string, action: ProgressFileAction) => Promise<void>;

function ProgressResources({ snapshot, onOpenFile }: { snapshot: ClientJobProgress; onOpenFile: OpenAttachment }) {
  const { deliveryUrl, attachments = [] } = snapshot;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function openFile(id: string, action: ProgressFileAction) {
    setBusy(id);
    setError("");
    try { await onOpenFile(id, action); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn’t open the file. Try again."); }
    finally { setBusy(null); }
  }
  if (!deliveryUrl && !attachments.length) return null;
  return <section className="jp-panel" aria-labelledby="jp-resources">
    <div className="jp-resources-heading">
      <h2 id="jp-resources">Project files & delivery</h2>
      {deliveryUrl ? <a className="jp-resource-action jp-delivery" href={deliveryUrl} target="_blank" rel="noopener noreferrer">
        View delivery <ExternalLink size={16} aria-hidden="true" />
      </a> : null}
    </div>
    {attachments.length ? <ul className="jp-files" aria-label="Shared attachments">
      {attachments.map(file => <li key={file.id} className="jp-file" aria-busy={busy === file.id}>
        <FileText size={22} aria-hidden="true" />
        <div className="jp-file-name"><strong>{file.name}</strong>
          <small>{file.size < 1048576 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1048576).toFixed(1)} MB`}</small>
        </div>
        <div className="jp-file-actions">
          {file.viewable ? <button className="jp-resource-action" type="button" disabled={Boolean(busy)} aria-label={`View ${file.name}`}
            onClick={() => void openFile(file.id, "view")}><ExternalLink size={15} aria-hidden="true" /> View</button> : null}
          <button className="jp-resource-action" type="button" disabled={Boolean(busy)} aria-label={`Download ${file.name}`}
            onClick={() => void openFile(file.id, "download")}><Download size={15} aria-hidden="true" /> Download</button>
        </div>
      </li>)}
    </ul> : null}
    {error ? <p className="jp-file-error" role="alert">{error}</p> : null}
  </section>;
}

export function ProgressReport({ snapshot, onLock, onOpenFile }: { snapshot: ClientJobProgress; onLock: () => void; onOpenFile: OpenAttachment }) {
  const { progress, stages, stageIndex } = snapshot;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <>
    <section className="jp-hero">
      <div className="jp-hero-copy">
        <span className="jp-kicker">Project progress</span>
        <h1 tabIndex={-1} ref={heading}>{snapshot.title}</h1>
        <span className="jp-stage-badge"><Activity size={15} /> {snapshot.stageLabel}</span>
        <p>{progress.total ? `${progress.completed} of ${progress.total} deliverables complete` : "Progress is based on the job’s current stage."}</p>
      </div>
      <div className="jp-ring" role="img" aria-label={`${progress.percent}% overall workflow progress`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="51" fill="none" stroke="#e1eaff" strokeWidth="9" />
          {progress.percent > 0 ? <circle cx="60" cy="60" r="51" fill="none" stroke="#2459ed" strokeWidth="9" pathLength="100" strokeDasharray={`${progress.percent} 100`} strokeLinecap="round" transform="rotate(-90 60 60)" /> : null}
        </svg>
        <div aria-hidden="true"><strong>{progress.percent}<span>%</span></strong><small>Overall progress</small></div>
      </div>
    </section>
    <section className="jp-panel" aria-labelledby="jp-workflow">
      <h2 id="jp-workflow">Job pipeline</h2>
      <ol className="jp-stepper">
        {jobWorkflow.map((stage, i) => <li key={stage} className={i <= stageIndex ? "is-reached" : ""} aria-current={i === stageIndex ? "step" : undefined}>
          <span aria-hidden="true">{i < stageIndex ? <Check size={16} /> : i === stageIndex ? <Circle size={9} fill="currentColor" /> : <Circle size={6} />}</span>
          <strong>{stage}</strong>{i === stageIndex ? <small>Current stage</small> : null}
        </li>)}
      </ol>
    </section>
    <section className="jp-panel" aria-labelledby="jp-deliverables">
      <h2 id="jp-deliverables">Deliverable pipeline</h2>
      {progress.total ? <>
        <p>Where the linked tasks and deliverables are right now.</p>
        <div className="jp-distribution" aria-hidden="true">{stages.map(stage => stage.items.length ? <span key={stage.title} style={{ background: stage.color, flexGrow: stage.items.length }} /> : null)}</div>
        <div className="jp-task-groups">{stages.map(stage => <section key={stage.title}>
          <h3><span aria-hidden="true" style={{ background: stage.color }} />{stage.title}<b>{stage.items.length}</b></h3>
          {stage.items.length ? <ul>{stage.items.map((name, index) => <li key={index}>{name}</li>)}</ul> : <p>No items in this stage.</p>}
        </section>)}</div>
      </> : <p>No linked tasks or deliverables yet. The job pipeline above shows the current stage.</p>}
    </section>
    <ProgressResources snapshot={snapshot} onOpenFile={onOpenFile} />
    <footer className="jp-footer"><span><ShieldCheck size={15} /> Read-only progress view</span><button type="button" onClick={onLock}><LockKeyhole size={14} /> Lock view</button></footer>
  </>;
}

export function JobProgressDashboard() {
  const [snapshot, setSnapshot] = useState<ClientJobProgress | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const gateHeading = useRef<HTMLHeadingElement>(null);
  const requestVersion = useRef(0);
  // No credential in the DOM, storage or cookies after unlocking. Keep it in
  // this mounted view only so every file click checks live access again.
  const access = useRef<{ token: string; pin: string } | null>(null);
  useEffect(() => {
    function lockOnNavigation() {
      requestVersion.current++;
      access.current = null;
      setSnapshot(null);
      setPin("");
      setError("");
      setBusy(false);
    }
    function lockOnRestore(event: PageTransitionEvent) {
      if (event.persisted) lockOnNavigation();
    }
    window.addEventListener("hashchange", lockOnNavigation);
    window.addEventListener("pageshow", lockOnRestore);
    return () => {
      window.removeEventListener("hashchange", lockOnNavigation);
      window.removeEventListener("pageshow", lockOnRestore);
    };
  }, []);
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const version = ++requestVersion.current;
    const credentials = { token: window.location.hash.slice(1), pin };
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/job-progress", {
        method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (version !== requestVersion.current) return;
      if (!response.ok || !data.snapshot) { setError(data.error ?? "Unable to open progress."); return; }
      access.current = credentials;
      setSnapshot(data.snapshot);
      setPin("");
    } catch { if (version === requestVersion.current) setError("Couldn’t connect. Please try again."); }
    finally { if (version === requestVersion.current) setBusy(false); }
  }
  function lock() {
    requestVersion.current++;
    access.current = null;
    setSnapshot(null);
    requestAnimationFrame(() => gateHeading.current?.focus());
  }
  async function openAttachment(id: string, action: ProgressFileAction) {
    const credentials = access.current;
    if (!credentials) return;
    // Reserve the preview tab during the click so Safari doesn't block it when
    // the signed URL comes back. Downloads retain their original filename.
    const preview = action === "view" ? window.open("about:blank", "_blank") : null;
    if (preview) preview.opener = null;
    try {
      const response = await fetch("/api/job-progress", {
        method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credentials, file: id, action }),
      });
      const data = await response.json();
      if (access.current !== credentials) { preview?.close(); return; }
      if (!response.ok || !data.url) throw new Error(data.error ?? "Couldn’t open the file. Try again.");
      if (preview && !preview.closed) preview.location.replace(data.url);
      else {
        const link = document.createElement("a");
        link.href = data.url;
        link.rel = "noreferrer";
        if (action === "download") link.download = "";
        document.body.append(link);
        link.click();
        link.remove();
      }
    } catch (reason) {
      preview?.close();
      throw reason;
    }
  }
  return <main className="jp-page">
    <div className="jp-shell">
      <header className="jp-top"><Image className="jp-brand" src={jobProgressBrand.logo} width={192} height={33} alt={jobProgressBrand.name} unoptimized /><span><LockKeyhole size={14} /> Private progress</span></header>
      {snapshot ? <ProgressReport snapshot={snapshot} onLock={lock} onOpenFile={openAttachment} /> :
        <section className="jp-gate">
          <div className="jp-gate-icon"><LockKeyhole size={26} /></div>
          <span className="jp-kicker">Project progress</span>
          <h1 ref={gateHeading} tabIndex={-1}>Unlock this job</h1>
          <p>Enter the six-digit PIN you received with this link to view the job’s progress and deliverables.</p>
          <form onSubmit={unlock} autoComplete="off">
            <label htmlFor="jp-pin">Access PIN</label>
            <input id="jp-pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={pin}
              onChange={event => setPin(event.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(error)} aria-describedby={error ? "jp-error" : undefined} />
            {error ? <p id="jp-error" className="jp-error" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy || pin.length !== 6}>{busy ? "Checking PIN…" : "View job progress"} <ArrowRight size={17} /></button>
          </form>
          <small><ShieldCheck size={14} /> No CRM account required</small>
        </section>}
    </div>
  </main>;
}
