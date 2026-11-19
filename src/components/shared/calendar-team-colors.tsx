"use client";

import { createContext, useContext, type CSSProperties } from "react";
import { calendarAssignedMembers, type CalendarTeamMember } from "@/lib/team-calendar-colors";
import type { AssignedRecord } from "@/lib/production-team";
import "./calendar-team-colors.css";

const CalendarTeamColors = createContext<readonly CalendarTeamMember[]>([]);
export const CalendarTeamColorsProvider = CalendarTeamColors.Provider;
export function useCalendarTeamColors() { return useContext(CalendarTeamColors); }

export function CalendarTeamMarker({ record }: { record: AssignedRecord }) {
  const members = calendarAssignedMembers(record, useCalendarTeamColors());
  if (!members.length) return null;
  const label = `Assigned to ${members.map(member => member.display_name).join(", ")}`;
  return <span className="calendar-team-marker" role="img" aria-label={label} title={label}>
    {members.map(member => <i key={member.user_id} data-member-id={member.user_id} style={{ "--calendar-person-color": member.color } as CSSProperties} />)}
  </span>;
}
