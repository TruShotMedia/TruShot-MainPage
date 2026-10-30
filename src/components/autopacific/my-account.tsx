"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Check, LoaderCircle, ShieldCheck, Trash2, X } from "lucide-react";
import { loadMyAccount, removeMyProfilePhoto, saveMyProfilePhoto } from "@/app/autopacific/profile-actions";
import { prepareProfilePhoto } from "@/lib/prepare-profile-photo";
import type { MyAccount } from "@/lib/production-profile";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";
import { TeamAvatar, useProductionTeam } from "./team-context";
import "./my-account.css";

const roles = { admin: "CRM administrator", manager: "Team manager", videographer: "Videographer", marketing: "Marketing" };

export function MyAccountDialog({ marketing, onClose }: { marketing: boolean; onClose: () => void }) {
  const team = useProductionTeam(), router = useRouter();
  const [account, setAccount] = useState<MyAccount | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false), [progress, setProgress] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), selection = useRef(0);
  const preparation = useRef<AbortController | null>(null);
  const lifetime = useRef({ active: true });
  useEffect(() => {
    const owner = lifetime.current; owner.active = true;
    let active = true;
    loadMyAccount().then(value => { if (active) setAccount(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Your account could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; owner.active = false; preparation.current?.abort(); };
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    const version = ++selection.current;
    preparation.current?.abort();
    const controller = new AbortController(); preparation.current = controller;
    setPreparing(true); setProgress("Opening photo…"); setError(""); setNotice(""); setConfirmRemove(false);
    try {
      const prepared = await prepareProfilePhoto(file, { signal: controller.signal, onProgress: message => { if (lifetime.current.active && version === selection.current) setProgress(message); } });
      if (lifetime.current.active && version === selection.current) setPhoto({ file: prepared, url: URL.createObjectURL(prepared) });
    } catch (reason) { if (!controller.signal.aborted && lifetime.current.active && version === selection.current) setError(reason instanceof Error ? reason.message : "This photo could not be prepared."); }
    finally { if (lifetime.current.active && version === selection.current) { setPreparing(false); setProgress(""); preparation.current = null; } }
  }
  function close() { preparation.current?.abort(); onClose(); }
  async function save(remove = false) {
    if (!account || (!remove && !photo)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); if (photo) form.set("photo", photo.file);
      const result = remove ? await removeMyProfilePhoto() : await saveMyProfilePhoto(form);
      setAccount(current => current ? { ...current, avatarUrl: result.avatarUrl } : current);
      team?.updateOwnAvatar(result.avatarUrl); setPhoto(null); setConfirmRemove(false);
      setNotice(remove ? "Photo removed. Your initials will appear instead." : "Photo updated across your workspace.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your photo could not be saved. Please retry."); }
    finally { setBusy(false); }
  }

  return <WorkspaceDialog className="my-account-dialog" titleId="my-account-title" busy={busy} onClose={close}
    header={<><div><span>Your workspace identity</span><h2 id="my-account-title">My Account</h2><p>A familiar face wherever you’re assigned.</p></div><button type="button" aria-label="Close My Account" disabled={busy} onClick={close}><X size={20} /></button></>}
    footer={<><span className="my-account-private"><ShieldCheck size={14} /> Only visible within your workspace</span><button type="button" onClick={close} disabled={busy}>{photo || preparing ? "Cancel" : "Done"}</button>{photo ? <button type="button" className="admin-primary-button" disabled={busy || preparing} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Save photo</button> : null}</>}>
    {loading ? <p role="status" className="my-account-loading"><LoaderCircle size={18} className="spin" /> Loading your account…</p> : null}
    {error ? <p role="alert" className="my-account-error">{error}</p> : null}
    {notice ? <p role="status" className="my-account-success"><Check size={16} />{notice}</p> : null}
    {account ? <>
      <section className="my-account-identity">
        <TeamAvatar className="my-account-avatar" name={account.displayName} url={photo?.url ?? account.avatarUrl} />
        <div><h3>{account.displayName}</h3><p>{account.email}</p><span>{roles[account.role]}</span></div>
      </section>
      <section className="my-account-photo-section" aria-labelledby="my-account-photo-title">
        <h3 id="my-account-photo-title">Profile photo</h3><p>Choose a clear photo of yourself. We’ll centre-crop it for your assignment circles.</p>
        <input ref={fileInput} className="my-account-file" type="file" accept="image/*,.heic,.heif" aria-label="Choose profile photo" disabled={busy || preparing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void choosePhoto(file); }} />
        <div className="my-account-photo-actions"><button type="button" disabled={busy || preparing} onClick={() => fileInput.current?.click()}>{preparing || busy ? <LoaderCircle size={16} className="spin" /> : <Camera size={16} />}{preparing ? "Preparing…" : busy ? "Saving…" : account.avatarUrl || photo ? "Change photo" : "Upload photo"}</button>
          {photo ? <button type="button" disabled={busy || preparing} onClick={() => setPhoto(null)}>Discard preview</button> : account.avatarUrl ? <button type="button" disabled={busy || preparing} onClick={() => setConfirmRemove(true)}><Trash2 size={15} />Remove photo</button> : null}
        </div>
        {preparing ? <small role="status">{progress}</small> : photo ? <small>Preview only · Save photo to share it with your team.</small> : <small>JPG, PNG, WebP and iPhone HEIC/HEIF photos · up to 50 MB</small>}
        <small><a href="/licenses/heic-to/NOTICE.txt" target="_blank" rel="noreferrer">Photo conversion credits</a></small>
        {confirmRemove ? <div className="my-account-remove"><p>Remove your profile photo? Your initials will be shown instead.</p><button type="button" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep photo</button><button type="button" disabled={busy} onClick={() => void save(true)}>Remove photo</button></div> : null}
      </section>
      <dl className="my-account-facts"><div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Username</dt><dd>{account.username ? `@${account.username}` : "Not set"}</dd></div><div><dt>Role</dt><dd>{roles[account.role]}</dd></div><div><dt>Workspace</dt><dd>AutoPacific Group</dd></div><div><dt>Account created</dt><dd>{new Date(account.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</dd></div><div><dt>Two-step verification</dt><dd>{account.mfaEnabled ? account.verifiedSession ? "Enabled · verified this session" : "Enabled" : "Not enabled"}</dd></div></dl>
      <div className="my-account-security"><ShieldCheck size={20} /><div><strong>Account security</strong><p>Manage authenticator verification separately from your profile.</p></div><Link href={`/autopacific/security?next=${marketing ? "/marketing" : "/autopacific"}`}>Manage</Link></div>
      <p className="my-account-role-note">Your name, username and role are managed by your team manager. Changing your photo never changes your permissions.</p>
    </> : null}
  </WorkspaceDialog>;
}
