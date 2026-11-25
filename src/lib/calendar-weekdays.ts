import { addBusinessDays, addDays, eachDayOfInterval, endOfMonth, format, isWeekend, parseISO, startOfMonth, startOfWeek } from "date-fns";

export const WORKWEEK_DAYS = 5;
const monday = { weekStartsOn: 1 } as const;
const dateKey = (date: Date) => format(date, "yyyy-MM-dd");

export function calendarWeekdayOnOrAfter(anchor: string) {
  const date = parseISO(anchor);
  return isWeekend(date) ? dateKey(addBusinessDays(date, 1)) : anchor;
}

export function calendarWorkweek(anchor: string) {
  const first = startOfWeek(parseISO(calendarWeekdayOnOrAfter(anchor)), monday);
  return Array.from({ length: WORKWEEK_DAYS }, (_, index) => dateKey(addDays(first, index)));
}

/** Pad with neighbouring weekdays, but omit rows that contain no day of this month. */
export function calendarWeekdayMonth(anchor: string) {
  const date = parseISO(anchor);
  const start = startOfMonth(date), end = endOfMonth(date);
  const firstMonday = startOfWeek(isWeekend(start) ? addBusinessDays(start, 1) : start, monday);
  const lastMonday = startOfWeek(isWeekend(end) ? addBusinessDays(end, -1) : end, monday);
  return eachDayOfInterval({ start: firstMonday, end: addDays(lastMonday, WORKWEEK_DAYS - 1) }).filter(day => !isWeekend(day)).map(dateKey);
}
