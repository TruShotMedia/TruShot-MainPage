"use client";
import { CalendarSync, LockKeyhole, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { CalendarCustomEvent } from "@/lib/types";
import { WorkspaceDialog } from "./workspace-dialog";
import "./outlook-calendar.css";

export function OutlookEventDetails({ event, onClose }: { event: CalendarCustomEvent; onClose: () => void }) {
  const date = (value: string, time: string | null) => `${format(parseISO(value), "EEE d MMM yyyy")}${time ? ` · ${time.slice(0, 5)}` : ""}`;
  return <WorkspaceDialog className="outlook-connection-dialog" titleId="outlook-event-title" onClose={onClose}
    header={<><div><span><CalendarSync size={14} /> Outlook · Read only</span><h2 id="outlook-event-title">{event.title}</h2><p>{event.external_calendar_name ?? "Outlook calendar"}</p></div><button type="button" aria-label="Close Outlook event" onClick={onClose}><X size={20} /></button></>}
    footer={<><span className="outlook-private-label"><LockKeyhole size={13} /> Private to your login</span><button type="button" onClick={onClose}>Done</button></>}>
    <div className="outlook-event-details"><dl><div><dt>{event.is_all_day ? "All day" : "Starts · Brisbane time"}</dt><dd>{date(event.start_date, event.start_time)}</dd></div>{event.end_date !== event.start_date || event.end_time ? <div><dt>Finishes{event.is_all_day ? "" : " · Brisbane time"}</dt><dd>{date(event.end_date, event.end_time)}</dd></div> : null}{event.location ? <div><dt>Location</dt><dd>{event.location}</dd></div> : null}{event.description ? <div><dt>Details</dt><dd>{event.description}</dd></div> : null}</dl><p>Make changes in Outlook. They’ll appear here after the calendar next refreshes.</p></div>
  </WorkspaceDialog>;
}
