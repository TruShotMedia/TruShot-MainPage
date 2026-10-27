"use client";

import { useState } from "react";
import { CalendarPlus2, X } from "lucide-react";

type Dates = { shoot_date: string; shoot_time: string; due_date: string; due_time: string };
export function JobScheduleFields({ planning, initial }: { planning: boolean; initial: Partial<Record<keyof Dates, string | null>> }) {
  const [dates, setDates] = useState<Dates>(() => ({ shoot_date: initial.shoot_date ?? "", shoot_time: initial.shoot_time?.slice(0, 5) ?? "", due_date: initial.due_date ?? "", due_time: initial.due_time?.slice(0, 5) ?? "" }));
  const [expanded, setExpanded] = useState(() => Boolean(initial.shoot_date || initial.shoot_time || initial.due_date || initial.due_time));
  const showDates = !planning || expanded;
  const change = (key: keyof Dates, value: string) => setDates((current) => ({ ...current, [key]: value }));
  return <>
    <div className="workspace-form-section job-schedule-section"><div><strong>Schedule {planning ? <small>Optional while planning</small> : null}</strong><p>{planning ? "This job can stay undated until it is ready to schedule." : "Production timing and the delivery deadline."}</p></div>
      {planning ? <button type="button" onClick={() => {
        if (expanded) { setDates({ shoot_date: "", shoot_time: "", due_date: "", due_time: "" }); setExpanded(false); }
        else setExpanded(true);
      }}>{expanded ? <><X size={14} /> Clear dates</> : <><CalendarPlus2 size={14} /> Add dates</>}</button> : null}
    </div>
    {showDates ? <>
      <label>Shoot date<input name="shoot_date" type="date" value={dates.shoot_date} onChange={(event) => change("shoot_date", event.target.value)} /></label>
      <label>Shoot time<input name="shoot_time" type="time" value={dates.shoot_time} onChange={(event) => change("shoot_time", event.target.value)} /></label>
      <label>Due date<input name="due_date" type="date" min={dates.shoot_date || undefined} value={dates.due_date} onChange={(event) => change("due_date", event.target.value)} /></label>
      <label>Due time<input name="due_time" type="time" value={dates.due_time} onChange={(event) => change("due_time", event.target.value)} /></label>
    </> : <><p className="job-schedule-empty form-span">No dates assigned. This job stays in Planning, not on the calendar.</p>{Object.entries(dates).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}</>}
  </>;
}
