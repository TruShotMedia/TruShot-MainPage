import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { buildCalendarRangeWeeks, calendarBookingTime, getCalendarScheduleRanges } from "./calendar-layout";
import { buildFlightCalendarItineraries } from "./flight-itineraries";
import type { AgendaSource } from "./production-agenda";
import type { ProductionScheduleData } from "./production-selected-day";

export const MOBILE_FORTNIGHT_RANGE_LIMIT = 2;
export const MOBILE_FORTNIGHT_DAY_LIMIT = 2;
export type MobileCalendarEntry = { id: string; date: string; title: string; time: string; label: string; source: AgendaSource };

export function mobileScheduleTone(item: AgendaSource, today: string) {
  if ((item.client_name ?? "").toLowerCase() !== "autopacific group") return "is-unrelated";
  if ("delay_info" in item && (item.delay_info?.delayed_from || item.delay_info?.delayed_to)) return "is-delayed";
  if ("is_complete" in item && item.is_complete) return "is-complete";
  if (item.entity_type === "calendar-event" && item.end_date < today || item.entity_type === "flight-event" && item.arrival_date < today) return "is-complete";
  if ("due_date" in item && item.due_date && item.due_date < today) return "is-overdue";
  return "is-autopacific";
}

/** A bounded display projection of already-authorised records; no reads or writes. */
export function buildMobileFortnight(anchor: string, data: ProductionScheduleData) {
  const first = startOfWeek(parseISO(anchor), { weekStartsOn: 1 });
  const dates = Array.from({ length: 14 }, (_, index) => format(addDays(first, index), "yyyy-MM-dd"));
  const jobs = data.calendarJobs.filter(job => job.status_label.toLowerCase() !== "planning");
  const assets = data.calendarCampaignAssets ?? [];
  const candidates = [
    ...jobs, ...assets, ...data.calendarEvents, ...buildFlightCalendarItineraries(data.flightEvents),
  ].filter(item => {
    const start = item.entity_type === "job" ? item.shoot_date : item.entity_type === "flight-event" ? item.departure_date : item.start_date;
    const end = item.entity_type === "calendar-event" ? item.end_date : item.entity_type === "flight-event" ? item.arrival_date : item.due_date;
    return start && end && start <= dates[13] && end >= dates[0];
  });
  const ranges = getCalendarScheduleRanges(candidates).map(range => ({ ...range, laneSpan: 1 }));
  const ranged = new Set(ranges.map(range => `${range.item.entity_type}:${range.item.id}`));
  const byDate = new Map(dates.map(date => [date, [] as MobileCalendarEntry[]]));
  function add(id: string, date: string | null, source: AgendaSource, label: string, time: string | null) {
    if (date) byDate.get(date)?.push({ id, date, title: source.title, label, time: (time ?? "").slice(0, 5), source });
  }
  for (const job of jobs) {
    if (ranged.has(`job:${job.id}`)) continue;
    add(`shoot:${job.id}`, job.shoot_date, job, "Shoot", job.shoot_time);
    if (job.due_date !== job.shoot_date) add(`job-due:${job.id}`, job.due_date, job, "Due", job.due_time);
  }
  for (const task of data.calendarTasks) add(`task:${task.id}`, task.due_date, task, "Due", task.due_time);
  for (const asset of assets) {
    if (ranged.has(`campaign-asset:${asset.id}`)) continue;
    add(`campaign-start:${asset.id}`, asset.start_date, asset, "Campaign", asset.start_time);
    if (asset.due_date !== asset.start_date) add(`campaign-due:${asset.id}`, asset.due_date, asset, "Due", asset.due_time);
  }
  for (const entries of byDate.values()) entries.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return buildCalendarRangeWeeks(dates, ranges).map(week => {
    const visibleSegments = week.segments.filter(segment => segment.lane < MOBILE_FORTNIGHT_RANGE_LIMIT);
    return {
      ...week,
      visibleSegments,
      visibleLanes: Math.min(week.laneCount, MOBILE_FORTNIGHT_RANGE_LIMIT),
      days: week.dayKeys.map((date, column) => {
        const spans = week.segments.filter(segment => segment.startColumn <= column && segment.startColumn + segment.span > column);
        const entries = byDate.get(date) ?? [];
        const hiddenRanges = spans.filter(segment => segment.lane >= MOBILE_FORTNIGHT_RANGE_LIMIT).length;
        return { date, entries: entries.slice(0, MOBILE_FORTNIGHT_DAY_LIMIT),
          count: spans.length + entries.length,
          hiddenCount: hiddenRanges + Math.max(0, entries.length - MOBILE_FORTNIGHT_DAY_LIMIT),
          summary: [...spans.map(segment => segment.item.title), ...entries.map(entry => `${entry.time || entry.label} ${entry.title}`)].join("; "),
        };
      }),
    };
  });
}

export function mobileRangeTime(segment: { start: string; item: AgendaSource }, firstVisibleDate: string) {
  return segment.start === firstVisibleDate ? calendarBookingTime(segment.item, segment.start) : "";
}
