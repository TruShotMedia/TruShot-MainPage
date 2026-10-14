import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarFlightEvent, CalendarJob } from "@/lib/types";

export type CalendarRangeItem = CalendarJob | CalendarCampaignAsset;
export type CalendarScheduleRangeItem = CalendarRangeItem | CalendarCustomEvent | CalendarFlightEvent;

export type CalendarJobRange<T extends CalendarScheduleRangeItem = CalendarRangeItem> = {
  id: string;
  start: string;
  end: string;
  durationDays: number;
  laneSpan: number;
  weekdaysOnly: boolean;
  item: T;
};

export type CalendarRangeSegment<T extends CalendarScheduleRangeItem = CalendarRangeItem> = CalendarJobRange<T> & {
  startsBeforeWeek: boolean;
  endsAfterWeek: boolean;
  startColumn: number;
  span: number;
  lane: number;
};

export type CalendarRangeWeek<T extends CalendarScheduleRangeItem = CalendarRangeItem> = {
  dayKeys: string[];
  laneCount: number;
  segments: CalendarRangeSegment<T>[];
};

function calendarDayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function isWeekend(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function isAutopacificWork(item: CalendarScheduleRangeItem) {
  if (item.entity_type === "calendar-event" || item.entity_type === "flight-event") return false;
  return item.client_name?.trim().replace(/\s+/g, " ").toLowerCase() === "autopacific group";
}

function countRangeDays(start: string, end: string, weekdaysOnly: boolean) {
  if (!weekdaysOnly) return calendarDayNumber(end) - calendarDayNumber(start) + 1;

  let count = 0;
  for (let day = calendarDayNumber(start); day <= calendarDayNumber(end); day += 1) {
    const weekday = new Date(day * 86_400_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export function getCalendarJobRanges(jobs: CalendarJob[]) {
  return getCalendarScheduleRanges(jobs);
}

export function getCalendarScheduleRanges<T extends CalendarScheduleRangeItem>(items: T[]): CalendarJobRange<T>[] {
  return items
    .flatMap((item): CalendarJobRange<T>[] => {
      const start = item.entity_type === "job"
        ? item.shoot_date
        : item.entity_type === "flight-event"
          ? item.departure_date
          : item.start_date;
      const end = item.entity_type === "calendar-event"
        ? item.end_date
        : item.entity_type === "flight-event"
          ? item.arrival_date
          : item.due_date;
      if (!start || !end || start > end) return [];
      const weekdaysOnly = isAutopacificWork(item);
      return [{
        id: `${item.entity_type}-${item.id}`,
        start,
        end,
        durationDays: countRangeDays(start, end, weekdaysOnly),
        laneSpan: item.entity_type === "flight-event" ? 2 : 1,
        weekdaysOnly,
        item,
      }];
    })
    .sort((left, right) => left.start.localeCompare(right.start) || right.end.localeCompare(left.end) || left.item.title.localeCompare(right.item.title));
}

export function buildCalendarRangeWeeks<T extends CalendarScheduleRangeItem>(dayKeys: string[], ranges: CalendarJobRange<T>[]): CalendarRangeWeek<T>[] {
  const weeks: CalendarRangeWeek<T>[] = [];

  for (let index = 0; index < dayKeys.length; index += 7) {
    const weekDays = dayKeys.slice(index, index + 7);
    if (!weekDays.length) continue;
    const weekStart = weekDays[0];
    const weekEnd = weekDays[weekDays.length - 1];
    const laneEnds: number[] = [];
    const segments = ranges
      .filter((range) => range.start <= weekEnd && range.end >= weekStart)
      .flatMap((range): CalendarRangeSegment<T>[] => {
        if (range.weekdaysOnly) {
          const visibleColumns = weekDays
            .map((date, column) => ({ date, column }))
            .filter(({ date }) => date >= range.start && date <= range.end && !isWeekend(date));
          if (!visibleColumns.length) return [];

          const columnRuns = visibleColumns.reduce<number[][]>((runs, { column }) => {
            const activeRun = runs.at(-1);
            if (!activeRun || activeRun.at(-1)! + 1 !== column) runs.push([column]);
            else activeRun.push(column);
            return runs;
          }, []);

          return columnRuns.map((columns) => ({
            ...range,
            startsBeforeWeek: false,
            endsAfterWeek: false,
            startColumn: columns[0],
            span: columns.length,
            lane: 0,
          }));
        }

        const clippedStart = range.start < weekStart ? weekStart : range.start;
        const clippedEnd = range.end > weekEnd ? weekEnd : range.end;
        const startColumn = weekDays.indexOf(clippedStart);
        const endColumn = weekDays.indexOf(clippedEnd);
        return [{
          ...range,
          startsBeforeWeek: range.start < weekStart,
          endsAfterWeek: range.end > weekEnd,
          startColumn,
          span: endColumn - startColumn + 1,
          lane: 0,
        }];
      })
      .sort((left, right) => left.startColumn - right.startColumn || right.laneSpan - left.laneSpan || right.span - left.span || left.item.title.localeCompare(right.item.title))
      .map((segment) => {
        const endColumn = segment.startColumn + segment.span - 1;
        let lane = 0;
        while (true) {
          const available = Array.from({ length: segment.laneSpan }, (_, offset) => laneEnds[lane + offset] ?? -1)
            .every((occupiedThrough) => occupiedThrough < segment.startColumn);
          if (available) break;
          lane += 1;
        }
        for (let offset = 0; offset < segment.laneSpan; offset += 1) laneEnds[lane + offset] = endColumn;
        return { ...segment, lane };
      });

    weeks.push({ dayKeys: weekDays, laneCount: laneEnds.length, segments });
  }

  return weeks;
}
