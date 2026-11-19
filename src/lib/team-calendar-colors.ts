import type { CSSProperties } from "react";
import type { AssignedRecord, TeamMember } from "./production-team";

export type CalendarTeamMember = { user_id: string; display_name: string; color: string };
const palette = ["#3975c6", "#9b54b9", "#c77b25", "#258882", "#c45079", "#628a31", "#7160c6", "#b75b39", "#3783a3", "#a3518b", "#75812b", "#585db0"];

function memberHash(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Stable across renders, device sessions, directory ordering and people filters. */
export function assignTeamCalendarColors(members: readonly TeamMember[]): CalendarTeamMember[] {
  const active = [...new Map(members.filter(member => member.is_active).map(member => [member.user_id, member])).values()];
  const colors = new Map<string, string>();
  const used = new Set<string>();
  for (const member of [...active].sort((a, b) => a.user_id.localeCompare(b.user_id))) {
    const start = memberHash(member.user_id) % palette.length;
    let color = palette[start];
    for (let offset = 0; used.has(color) && offset < palette.length; offset++) color = palette[(start + offset + 1) % palette.length];
    if (used.has(color)) color = `hsl(${(memberHash(member.user_id) + colors.size * 137.508) % 360} 55% 43%)`;
    colors.set(member.user_id, color);
    used.add(color);
  }
  return active.map(member => ({ user_id: member.user_id, display_name: member.display_name, color: colors.get(member.user_id)! }));
}

export function calendarAssignedMembers(record: AssignedRecord, members: readonly CalendarTeamMember[]) {
  return members.filter(member => record.assignee_ids?.includes(member.user_id));
}

export function calendarTeamAttributes(record: AssignedRecord, members: readonly CalendarTeamMember[]) {
  const assigned = calendarAssignedMembers(record, members);
  if (!assigned.length) return {};
  const stops = assigned.map((member, index) =>
    `color-mix(in srgb, ${member.color} 16%, var(--workspace-surface, #fff)) ${index / assigned.length * 100}% ${(index + 1) / assigned.length * 100}%`);
  return {
    "data-team-calendar": "true",
    "aria-description": `Assigned to ${assigned.map(member => member.display_name).join(", ")}`,
    style: {
      "--team-calendar-color": assigned[0].color,
      "--team-calendar-fill": `linear-gradient(90deg, ${stops.join(", ")})`,
    } as CSSProperties,
  };
}
