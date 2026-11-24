import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import type { CalendarViewMode } from "./calendar-view-memory";
import { layoutTimedBlocks, type TimedBlock } from "./production-agenda";

const monday = { weekStartsOn: 1 } as const;
const dayKey = (day: Date) => format(day, "yyyy-MM-dd");
const dayCount = (mode: CalendarViewMode) => mode === "day" ? 1 : mode === "week" ? 7 : 14;

export function mobileCalendarDates(anchor: string, mode: CalendarViewMode) {
  const date = parseISO(anchor);
  if (mode === "month") return eachDayOfInterval({
    start: startOfWeek(startOfMonth(date), monday), end: endOfWeek(endOfMonth(date), monday),
  }).map(dayKey);
  const first = mode === "day" || mode === "list" ? date : startOfWeek(date, monday);
  return Array.from({ length: dayCount(mode) }, (_, i) => dayKey(addDays(first, i)));
}

export function adjacentMobileCalendarAnchor(anchor: string, mode: CalendarViewMode, direction: -1 | 1) {
  const date = parseISO(anchor);
  return dayKey(mode === "month" ? addMonths(date, direction) : addDays(date, direction * dayCount(mode)));
}

export function mobileCalendarPeriodTitle(dates: readonly string[], anchor: string, mode: CalendarViewMode) {
  const date = parseISO(anchor);
  if (mode === "month") return format(date, "MMMM yyyy");
  if (mode === "day") return format(date, "EEE d MMM");
  const first = parseISO(dates[0]), last = parseISO(dates[dates.length - 1]);
  return `${format(first, first.getMonth() === last.getMonth() ? "d" : "d MMM")}–${format(last, "d MMM")}`;
}

/** A one-pixel-per-minute phone grid. Reserve tappable height in the lane
 * calculation so adjacent short events never overlap each other's buttons. */
export function mobileHourLayout(bookings: readonly TimedBlock[], now: number | null) {
  const blocks = layoutTimedBlocks(bookings.map(block => ({
    ...block, end: Math.max(block.end, block.start + 47),
  })));
  const first = Math.max(0, Math.min(7, ...blocks.map(block => Math.floor(block.start / 60)), now === null ? 7 : Math.floor(now / 60)));
  const last = Math.min(24, Math.max(19, ...blocks.map(block => Math.ceil(block.end / 60)), now === null ? 19 : Math.ceil((now + 1) / 60)));
  return {
    blocks,
    firstMinute: first * 60,
    height: Math.max(last * 60, ...blocks.map(block => block.end)) - first * 60,
    hours: Array.from({ length: last - first }, (_, index) => first + index),
    lanes: Math.max(1, ...blocks.map(block => block.lanes)),
  };
}
