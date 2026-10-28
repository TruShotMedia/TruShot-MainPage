"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, LoaderCircle, Users, X } from "lucide-react";
import { loadTeamComments, loadTeamDirectory, markTeamCommentsRead, saveTeamMember } from "@/app/autopacific/team-actions";
import type { TeamComment, TeamDirectoryMember } from "@/lib/production-team";
import { teamInitials } from "@/lib/production-team";
import { useProductionTeam } from "./team-context";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";
import { TabletNotificationControl } from "@/components/tablet/tablet-notification-control";

export function TeamManagement({ onClose }: { onClose: () => void }) {
  const [members, setMembers] = useState<TeamDirectoryMember[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const router = useRouter();
  useEffect(() => { let active = true; loadTeamDirectory().then(rows => { if (active) setMembers(rows); }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  function change(id: string, updates: Partial<TeamDirectoryMember>) { setMembers(current => current.map(member => member.user_id === id ? { ...member, ...updates } : member)); setNotice(""); }
  async function save(member: TeamDirectoryMember) {
    setSaving(member.user_id); setError(""); setNotice("");
    try { await saveTeamMember(member); setNotice(`${member.display_name} updated.`); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This account could not be updated."); }
    finally { setSaving(""); }
  }
  return <WorkspaceDialog className="team-management-dialog" titleId="team-management-title" onClose={onClose}
    header={<><div><span>AutoPacific / team settings</span><h2 id="team-management-title">Your team</h2><p>Enable existing accounts. New members start with Marketing permissions.</p></div><button type="button" aria-label="Close team management" onClick={onClose}><X size={20} /></button></>}
    footer={<><small>Disabled accounts cannot access this workspace. Their history is retained.</small><button type="button" className="admin-primary-button" onClick={onClose}>Done</button></>}>
    {loading ? <p role="status"><LoaderCircle className="spin" size={16} /> Loading accounts…</p> : null}
    {error ? <p role="alert" className="team-field-warning">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    <div className="team-directory">{members.map(member => <article key={member.user_id}>
      <header><span className="team-avatar" style={{ background: member.avatar_color }}>{teamInitials(member.display_name)}</span><div><strong>{member.email}</strong><small>{member.is_active ? "Enabled team member" : "Hidden · no team access"}</small></div></header>
      <div className="team-directory-fields"><label>Display name<input value={member.display_name} maxLength={80} onChange={event => change(member.user_id, { display_name: event.target.value })} /></label>
        <label>Username<input autoCapitalize="none" spellCheck={false} value={member.username ?? ""} placeholder="e.g. john.smith" maxLength={40} onChange={event => change(member.user_id, { username: event.target.value.toLowerCase() })} /></label>
        <label>Role<select value={member.role} onChange={event => change(member.user_id, { role: event.target.value as TeamDirectoryMember["role"] })}><option value="marketing">Marketing</option><option value="videographer">Videographer</option><option value="manager">Team manager</option></select></label>
        <label className="team-enabled"><input type="checkbox" checked={member.is_active} onChange={event => change(member.user_id, { is_active: event.target.checked })} /> Enable in team</label>
        <button type="button" className="admin-primary-button" disabled={Boolean(saving) || !member.username?.trim() || !member.display_name.trim()} onClick={() => void save(member)}>{saving === member.user_id ? "Saving…" : "Save member"}</button>
      </div>
    </article>)}</div>
    <p className="team-role-guide">Marketing: shared briefs, review approvals and their own work. Videographer: production tools. Team manager: production tools plus membership management. None grants access to TruShot finances or other clients.</p>
  </WorkspaceDialog>;
}

export function TeamNotifications({ onOpenRecord, publicKey = "" }: { onOpenRecord: (kind: "job" | "task", id: string) => void; publicKey?: string }) {
  const team = useProductionTeam();
  const [open, setOpen] = useState(false), [items, setItems] = useState<TeamComment[]>([]), [error, setError] = useState("");
  const [loading, setLoading] = useState(false), [filter, setFilter] = useState("all");
  const refresh = useCallback(async () => {
    if (!navigator.onLine || document.visibilityState !== "visible") return;
    setLoading(true);
    try { setItems(await loadTeamComments()); setError(""); } catch { setError("Updates couldn’t refresh. Try again shortly."); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 800);
    const interval = setInterval(() => void refresh(), 120_000);
    const onChange = () => void refresh();
    window.addEventListener("production-comments-changed", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener("production-comments-changed", onChange); document.removeEventListener("visibilitychange", onChange); };
  }, [refresh]);
  const unread = items.filter(item => item.unread).length;
  const visible = items.filter(item => filter === "unread" ? item.unread : filter === "mentions" ? item.mention_user_ids.includes(team?.userId ?? "") : true);
  async function mark(itemsToMark: TeamComment[]) {
    try {
      await markTeamCommentsRead(itemsToMark.map(item => ({ id: item.id, updated_at: item.updated_at })));
      const revisions = new Map(itemsToMark.map(item => [item.id, item.updated_at]));
      setItems(current => current.map(item => revisions.get(item.id) === item.updated_at ? { ...item, unread: false } : item));
    } catch { setError("Read status couldn’t be saved. Please retry."); }
  }
  return <><button type="button" className="team-inbox-button" aria-label={`Team updates${unread ? `, ${unread} unread` : ""}`} onClick={() => { setOpen(true); void refresh(); }}><Bell size={17} />{unread ? <b>{unread > 99 ? "99+" : unread}</b> : null}</button>
    {open ? <WorkspaceDialog className="team-inbox-dialog" titleId="team-inbox-title" onClose={() => setOpen(false)}
      header={<><div><span>Team communication</span><h2 id="team-inbox-title">Updates <small>{unread} unread</small></h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close updates"><X size={20} /></button></>}
      footer={<>{publicKey ? <div className="team-inbox-device"><TabletNotificationControl experience="autopacific" experienceName="AutoPacific" publicKey={publicKey} /><small>Device reminders</small></div> : null}<button type="button" onClick={() => void refresh()} disabled={loading}>Refresh</button><button type="button" className="admin-primary-button" disabled={!unread} onClick={() => void mark(items.filter(item => item.unread))}><CheckCheck size={16} /> Mark all as read</button></>}>
      <div className="apg-view-pills" aria-label="Update filters">{["all", "unread", "mentions"].map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      {error ? <p role="alert">{error}</p> : null}{loading && !items.length ? <p role="status">Loading updates…</p> : null}
      <div className="team-comment-feed">{visible.map(item => { const author = team?.members.find(member => member.user_id === item.created_by); return <button type="button" key={item.id} className={item.unread ? "is-unread" : ""} onClick={() => { void mark([item]); setOpen(false); onOpenRecord(item.record_kind, item.job_id ?? item.task_id ?? ""); }}>
        <span className="team-avatar" style={{ background: author?.avatar_color ?? "#7c8891" }}>{teamInitials(author?.display_name ?? "Team")}</span>
        <span><strong>{author?.display_name ?? "Team member"} commented</strong><small>{item.record_title} · {new Date(item.updated_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small><span className="team-comment-preview">{item.body}</span></span>{item.unread ? <i aria-label="Unread" /> : null}
      </button>; })}{!loading && !visible.length ? <div className="apg-empty"><Users size={24} /><p>{filter === "unread" ? "You’re all caught up." : "No updates in this view yet."}</p></div> : null}</div>
    </WorkspaceDialog> : null}
  </>;
}
