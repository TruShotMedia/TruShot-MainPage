import { addBusinessDays, addDays, addMonths, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import type { MobileCalendarViewMode } from "./calendar-view-memory";
import { calendarWeekdayMonth, calendarWeekdayOnOrAfter, WORKWEEK_DAYS } from "./calendar-weekdays";
import { layoutTimedBlocks, type TimedBlock } from "./production-agenda";

const monday = { weekStartsOn: 1 } as const;
const dayKey = (day: Date) => format(day, "yyyy-MM-dd");
export { calendarWeekdayOnOrAfter as mobileWeekdayOnOrAfter };
export const MOBILE_CALENDAR_COLUMNS = WORKWEEK_DAYS;

export function mobileCalendarDates(anchor: string, mode: MobileCalendarViewMode) {
  if (mode === "month") return calendarWeekdayMonth(anchor);
  const date = parseISO(calendarWeekdayOnOrAfter(anchor));
  const first = mode === "day" || mode === "list" ? date : startOfWeek(date, monday);
  const count = mode === "day" ? 1 : mode === "week" ? MOBILE_CALENDAR_COLUMNS : 2 * MOBILE_CALENDAR_COLUMNS;
  return Array.from({ length: count }, (_, i) => dayKey(addBusinessDays(first, i)));
}

export function adjacentMobileCalendarAnchor(anchor: string, mode: MobileCalendarViewMode, direction: -1 | 1) {
  if (mode === "month") return calendarWeekdayOnOrAfter(dayKey(startOfMonth(addMonths(parseISO(anchor), direction))));
  const date = parseISO(calendarWeekdayOnOrAfter(anchor));
  if (mode === "day" || mode === "list") return dayKey(addBusinessDays(date, direction * (mode === "day" ? 1 : 2 * MOBILE_CALENDAR_COLUMNS)));
  return dayKey(addDays(date, direction * (mode === "week" ? 7 : 14)));
}

export function mobileCalendarPeriodTitle(dates: readonly string[], anchor: string, mode: MobileCalendarViewMode) {
  const date = parseISO(anchor);
  if (mode === "month") return format(date, "MMMM yyyy");
  if (mode === "day") return format(parseISO(dates[0]), "EEE d MMM");
  const first = parseISO(dates[0]), last = parseISO(dates[dates.length - 1]);
  return `${format(first, first.getMonth() === last.getMonth() ? "d" : "d MMM")}–${format(last, "d MMM")}`;
}

/** A one-pixel-per-minute phone grid. Reserve tappable height in the lane
 * calculation so adjacent short events never overlap each other's buttons. */
export function mobileHourLayout(bookings: readonly TimedBlock[], now: number | null, fullDay = false) {
  const blocks = layoutTimedBlocks(bookings.map(block => ({
    ...block, end: Math.max(block.end, block.start + 47),
  })));
  const first = fullDay ? 0 : Math.max(0, Math.min(7, ...blocks.map(block => Math.floor(block.start / 60)), now === null ? 7 : Math.floor(now / 60)));
  const last = fullDay ? 24 : Math.min(24, Math.max(19, ...blocks.map(block => Math.ceil(block.end / 60)), now === null ? 19 : Math.ceil((now + 1) / 60)));
  return {
    blocks,
    firstMinute: first * 60,
    lastMinute: last * 60,
    height: Math.max(last * 60, ...blocks.map(block => block.end)) - first * 60,
    hours: Array.from({ length: last - first }, (_, index) => first + index),
    lanes: Math.max(1, ...blocks.map(block => block.lanes)),
  };
}
