import { CalendarClock, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { DelayInfo } from "@/lib/types";

export function DelayHistoryBanner({ delayInfo }: { delayInfo?: DelayInfo }) {
  if (!delayInfo?.history.length) return null;
  const mostRecent = delayInfo.delayed_from ?? delayInfo.delayed_to ?? delayInfo.history.at(-1) ?? null;
  return (
    <aside className="delay-history-banner">
      <header><RotateCcw size={15} /><div><strong>{delayInfo.delayed_from ? "Rescheduled work" : "Delay history"}</strong><span>{mostRecent ? `Moved to ${formatDate(mostRecent.rescheduled_date)}` : ""}</span></div></header>
      {delayInfo.delayed_from ? (
        <p>Delayed because: <b>{delayInfo.delayed_from.reason}</b></p>
      ) : delayInfo.delayed_to ? (
        <p>Rescheduled because: <b>{delayInfo.delayed_to.reason}</b></p>
      ) : null}
      {delayInfo.history.length > 1 ? (
        <details>
          <summary><CalendarClock size={13} /> {delayInfo.history.length} delay events retained</summary>
          <ol>{delayInfo.history.map((entry) => <li key={entry.id}><strong>{formatDate(entry.rescheduled_date)}</strong><span>{entry.reason}</span></li>)}</ol>
        </details>
      ) : null}
    </aside>
  );
}
