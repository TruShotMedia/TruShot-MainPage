import type {
  CalendarCustomEvent,
  CalendarFlightEvent,
  CalendarItem,
  CalendarJob,
  CalendarTask,
} from "@/lib/types";
import { isCalendarPost } from "./calendar-event";
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
  span: number;
};
const minutes = (time: string) => {
  const [hours, mins, seconds = 0] = time.split(":").map(Number);
  return hours * 60 + mins + seconds / 60;
};
const bookingEnd = (start: number, end: number) => Math.min(1440, end > start ? end : start + 15);

export function layoutTimedBlocks(
  items: Omit<TimedBlock, "lane" | "lanes" | "span">[],
): TimedBlock[] {
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id),
  );
  const result: TimedBlock[] = [];
  let group: TimedBlock[][] = [], groupEnd = -1;
  const finish = () => {
    for (const lane of group) {
      for (const block of lane) {
        block.lanes = group.length;
        // Reclaim empty space on the right unless something actually occupies it
        // during this booking. A shared start/end boundary is not an overlap.
        while (block.lane + block.span < group.length &&
          !group[block.lane + block.span].some(other => other.start < block.end && block.start < other.end)) {
          block.span++;
        }
      }
    }
    group = [];
    groupEnd = -1;
  };
  for (const item of sorted) {
    if (item.start >= groupEnd) finish();
    let lane = group.findIndex(bookings => bookings[bookings.length - 1].end <= item.start);
    if (lane < 0) lane = group.push([]) - 1;
    const block = { ...item, lane, lanes: 1, span: 1 };
    group[lane].push(block);
    result.push(block);
    groupEnd = Math.max(item.end, groupEnd);
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
    timed: Omit<TimedBlock, "lane" | "lanes" | "span">[] = [];
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
          end: bookingEnd(start, end),
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
    const post = isCalendarPost(event);
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
    if (end === 0 && event.start_date < date) continue; // A booking ending at midnight occupies none of this day.
    timed.push({
      id: event.id,
      title: event.title,
      start,
      end: bookingEnd(start, end),
      time: `${event.start_date === date ? event.start_time.slice(0, 5) : "Continues"}${event.end_date === date && event.end_time ? `–${event.end_time.slice(0, 5)}` : ""}`,
      detail: post ? (event.location ? `Scheduled post · ${event.location}` : "Scheduled post") : event.location ?? "Calendar event",
      source: event,
    });
  }
  for (const flight of input.flights) {
    if (flight.departure_date > date || flight.arrival_date < date) continue;
    const start =
        flight.departure_date === date ? minutes(flight.departure_time) : 0,
      end = flight.arrival_date === date ? minutes(flight.arrival_time) : 1440;
    if (end === 0 && flight.departure_date < date) continue;
    timed.push({
      id: `flight:${flight.id}`,
      title: flight.title,
      start,
      end: bookingEnd(start, end),
      time: `${flight.departure_date === date ? flight.departure_time.slice(0, 5) : "Continues"}${flight.arrival_date === date ? `–${flight.arrival_time.slice(0, 5)}` : ""}`,
      detail: `${flight.origin_location} → ${flight.destination_location}`,
      source: flight,
    });
  }
  return { allDay, timed: layoutTimedBlocks(timed) };
}
