import type {
  CalendarCustomEvent,
  CalendarFlightEvent,
  CalendarItem,
  CalendarJob,
  CalendarTask,
} from "@/lib/types";
export type AgendaSource =
  | CalendarItem
  | CalendarCustomEvent
  | CalendarFlightEvent;
export type TimedBlock = {
  id: string;
  title: string;
  start: number;
  end: number;
  time: string;
  detail: string;
  source: AgendaSource;
  lane: number;
  lanes: number;
};
const minutes = (time: string) => {
  const [hours, mins] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + mins;
};
export function layoutTimedBlocks(
  items: Omit<TimedBlock, "lane" | "lanes">[],
): TimedBlock[] {
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id),
  );
  const result: TimedBlock[] = [];
  let group: TimedBlock[] = [],
    ends: number[] = [],
    groupEnd = -1;
  const finish = () => {
    for (const block of group) block.lanes = ends.length;
    group = [];
    ends = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd) finish();
    let lane = ends.findIndex((end) => end <= item.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.end;
    const block = { ...item, lane, lanes: 1 };
    group.push(block);
    result.push(block);
    groupEnd = Math.max(item.end, group.length === 1 ? item.end : groupEnd);
  }
  finish();
  return result;
}
export function productionDayAgenda(
  date: string,
  input: {
    jobs: CalendarJob[];
    tasks: CalendarTask[];
    events: CalendarCustomEvent[];
    flights: CalendarFlightEvent[];
  },
) {
  const allDay: Array<{
      id: string;
      title: string;
      detail: string;
      source: AgendaSource;
    }> = [],
    timed: Omit<TimedBlock, "lane" | "lanes">[] = [];
  for (const job of input.jobs) {
    if (job.shoot_date === date) {
      if (job.shoot_time) {
        const start = minutes(job.shoot_time),
          end = job.shoot_end_time
            ? minutes(job.shoot_end_time)
            : Math.min(1440, start + 30);
        timed.push({
          id: `shoot:${job.id}`,
          title: job.title,
          start,
          end: Math.max(end, start + 15),
          time: `${job.shoot_time.slice(0, 5)}${job.shoot_end_time ? `–${job.shoot_end_time.slice(0, 5)}` : ""}`,
          detail: job.shoot_end_time
            ? "Shoot booking"
            : "Shoot · finish time not set",
          source: job,
        });
      } else
        allDay.push({
          id: `shoot:${job.id}`,
          title: job.title,
          detail: "Shoot · time not set",
          source: job,
        });
    }
    if (job.due_date === date)
      allDay.push({
        id: `job-due:${job.id}`,
        title: job.title,
        detail: `Delivery deadline${job.due_time ? ` · ${job.due_time.slice(0, 5)}` : ""}`,
        source: job,
      });
  }
  for (const task of input.tasks)
    if (task.due_date === date)
      allDay.push({
        id: `task:${task.id}`,
        title: task.title,
        detail: `Asset deadline${task.due_time ? ` · ${task.due_time.slice(0, 5)}` : ""}`,
        source: task,
      });
  for (const event of input.events) {
    if (event.start_date > date || event.end_date < date) continue;
    if (event.is_all_day || !event.start_time) {
      allDay.push({
        id: event.id,
        title: event.title,
        detail: "All day",
        source: event,
      });
      continue;
    }
    const start = event.start_date === date ? minutes(event.start_time) : 0,
      end =
        event.end_date === date && event.end_time
          ? minutes(event.end_time)
          : 1440;
    timed.push({
      id: event.id,
      title: event.title,
      start,
      end: Math.min(1440, Math.max(start + 15, end)),
      time: `${event.start_date === date ? event.start_time.slice(0, 5) : "Continues"}${event.end_date === date && event.end_time ? `–${event.end_time.slice(0, 5)}` : ""}`,
      detail: event.location ?? "Calendar event",
      source: event,
    });
  }
  for (const flight of input.flights) {
    if (flight.departure_date > date || flight.arrival_date < date) continue;
    const start =
        flight.departure_date === date ? minutes(flight.departure_time) : 0,
      end = flight.arrival_date === date ? minutes(flight.arrival_time) : 1440;
    timed.push({
      id: `flight:${flight.id}`,
      title: flight.title,
      start,
      end: Math.min(1440, Math.max(start + 15, end)),
      time: `${flight.departure_date === date ? flight.departure_time.slice(0, 5) : "Continues"}${flight.arrival_date === date ? `–${flight.arrival_time.slice(0, 5)}` : ""}`,
      detail: `${flight.origin_location} → ${flight.destination_location}`,
      source: flight,
    });
  }
  return { allDay, timed: layoutTimedBlocks(timed) };
}
