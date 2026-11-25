import { workingHoursTime, type WorkWindow } from "@/lib/calendar-working-hours";
import styles from "./calendar-working-hours.module.css";

export function WorkingHoursLegend({ window }: { window: WorkWindow | null }) {
  return <p className={styles.legend}>
    {window ? <><strong>My working hours</strong><span>{workingHoursTime(window.start)}–{workingHoursTime(window.end)} · Brisbane time</span></> : "No working hours · Brisbane time"}
  </p>;
}

export function WorkingHoursBand({ window, firstMinute, hourHeight }: {
  window: WorkWindow; firstMinute: number; hourHeight: number;
}) {
  return <div className={styles.band} aria-hidden="true" data-working-hours-band=""
    style={{ top: (window.start - firstMinute) * hourHeight / 60, height: (window.end - window.start) * hourHeight / 60 }} />;
}
