"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { TeamContextData, TeamMember } from "@/lib/production-team";
import { teamInitials } from "@/lib/production-team";

type TeamContextValue = TeamContextData & { updateOwnAvatar: (url: string | null) => void };
const TeamContext = createContext<TeamContextValue | null>(null);
export function ProductionTeamProvider({ value, children }: { value: TeamContextData; children: ReactNode }) {
  const [photo, setPhoto] = useState<{ source?: string | null; url: string | null } | null>(null);
  const context = useMemo(() => {
    const ownUrl = photo && photo.source === value.selfAvatarUrl ? photo.url : value.selfAvatarUrl;
    return { ...value, selfAvatarUrl: ownUrl,
      members: value.members.map(member => member.user_id === value.userId ? { ...member, avatar_url: ownUrl } : member),
      updateOwnAvatar: (url: string | null) => setPhoto({ source: value.selfAvatarUrl, url }) };
  }, [photo, value]);
  return <TeamContext.Provider value={context}>{children}</TeamContext.Provider>;
}
export function useProductionTeam() { return useContext(TeamContext); }

export function TeamAvatar({ member, name, url, className = "" }: { member?: Pick<TeamMember, "display_name" | "avatar_color" | "avatar_url">; name?: string; url?: string | null; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = url === undefined ? member?.avatar_url : url;
  const label = name ?? member?.display_name ?? "Team member";
  return <span className={`team-avatar ${className}`} title={label} style={{ background: member?.avatar_color ?? "#4b86a4" }}>
    {photo && photo !== failedUrl ?
      // A cookie-authenticated private image must not pass through the public image optimiser.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(photo)} />
      : teamInitials(label)}
  </span>;
}

export function TeamAssignmentField({ initialIds, label = "Assigned team", defaultIds, onChange }: { initialIds?: string[]; defaultIds?: string[]; label?: string; onChange?: (ids: string[]) => void }) {
  const team = useProductionTeam();
  const [selected, setSelected] = useState(initialIds ?? defaultIds ?? (team ? [team.members.some(member => member.user_id === team.userId) ? team.userId : team.videographerId] : []));
  if (!team) return null;
  const enabled = team.members.filter(member => member.is_active);
  const inactiveIds = selected.filter(id => !enabled.some(member => member.user_id === id));
  function change(ids: string[]) { setSelected(ids); onChange?.(ids); }
  return <fieldset className="team-assignment form-span"><legend>{label} <small>Choose one or more</small></legend>
    <input type="hidden" name="assignee_ids" value={JSON.stringify(selected)} />
    <div className="team-assignment-options">{enabled.map(member => <label key={member.user_id} className={selected.includes(member.user_id) ? "is-selected" : ""}>
      <input type="checkbox" checked={selected.includes(member.user_id)} onChange={event => change(event.target.checked ? [...selected, member.user_id] : selected.filter(id => id !== member.user_id))} />
      <TeamAvatar member={member} /><span>{member.display_name}{member.user_id === team.userId ? <small>You</small> : null}</span>
    </label>)}</div>
    <button type="button" className="team-text-button" onClick={() => change(enabled.map(member => member.user_id))}>Select all team members</button>
    {!selected.length ? <span className="team-field-warning">Choose at least one team member before saving.</span> : null}
    {inactiveIds.length ? <small>Includes a former team member. Existing assignments are retained until you change them.</small> : null}
  </fieldset>;
}

export function TeamAvatars({ ids = [] }: { ids?: string[] }) {
  const team = useProductionTeam();
  if (!team || !ids.length) return null;
  const members = ids.map(id => team.members.find(member => member.user_id === id));
  return <span className="team-avatar-stack" aria-label={`Assigned: ${members.map(member => member?.display_name ?? "Former member").join(", ")}`}>
    {members.slice(0, 4).map((member, index) => <TeamAvatar key={ids[index]} member={member} name={member?.display_name ?? "Former member"} />)}
    {ids.length > 4 ? <span className="team-avatar">+{ids.length - 4}</span> : null}
  </span>;
}
