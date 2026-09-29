import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarJob } from "@/lib/types";

export type CalendarRangeItem = CalendarJob | CalendarCampaignAsset;
export type CalendarScheduleRangeItem = CalendarRangeItem | CalendarCustomEvent;

export type CalendarJobRange<T extends CalendarScheduleRangeItem = CalendarRangeItem> = {
  id: string;
  start: string;
  end: string;
  durationDays: number;
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

export function getCalendarJobRanges(jobs: CalendarJob[]) {
  return getCalendarScheduleRanges(jobs);
}

export function getCalendarScheduleRanges<T extends CalendarScheduleRangeItem>(items: T[]): CalendarJobRange<T>[] {
  return items
    .flatMap((item): CalendarJobRange<T>[] => {
      const start = item.entity_type === "job" ? item.shoot_date : item.start_date;
      const end = item.entity_type === "calendar-event" ? item.end_date : item.due_date;
      if (!start || !end || start > end) return [];
      return [{
        id: `${item.entity_type}-${item.id}`,
        start,
        end,
        durationDays: calendarDayNumber(end) - calendarDayNumber(start) + 1,
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
      .map((range) => {
        const clippedStart = range.start < weekStart ? weekStart : range.start;
        const clippedEnd = range.end > weekEnd ? weekEnd : range.end;
        const startColumn = weekDays.indexOf(clippedStart);
        const endColumn = weekDays.indexOf(clippedEnd);
        return {
          ...range,
          startsBeforeWeek: range.start < weekStart,
          endsAfterWeek: range.end > weekEnd,
          startColumn,
          span: endColumn - startColumn + 1,
          lane: 0,
        };
      })
      .sort((left, right) => left.startColumn - right.startColumn || right.span - left.span || left.item.title.localeCompare(right.item.title))
      .map((segment) => {
        const endColumn = segment.startColumn + segment.span - 1;
        let lane = laneEnds.findIndex((occupiedThrough) => occupiedThrough < segment.startColumn);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = endColumn;
        return { ...segment, lane };
      });

    weeks.push({ dayKeys: weekDays, laneCount: laneEnds.length, segments });
  }

  return weeks;
}
