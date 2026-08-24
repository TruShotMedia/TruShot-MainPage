import type { CalendarJob } from "@/lib/types";

export type CalendarJobRange = {
  id: string;
  start: string;
  end: string;
  durationDays: number;
  item: CalendarJob;
};

export type CalendarRangeSegment = CalendarJobRange & {
  startsBeforeWeek: boolean;
  endsAfterWeek: boolean;
  startColumn: number;
  span: number;
  lane: number;
};

export type CalendarRangeWeek = {
  dayKeys: string[];
  laneCount: number;
  segments: CalendarRangeSegment[];
};

function calendarDayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getCalendarJobRanges(jobs: CalendarJob[]) {
  return jobs
    .filter((job) => job.shoot_date && job.due_date && job.shoot_date <= job.due_date)
    .map((job): CalendarJobRange => ({
      id: job.id,
      start: job.shoot_date!,
      end: job.due_date!,
      durationDays: calendarDayNumber(job.due_date!) - calendarDayNumber(job.shoot_date!) + 1,
      item: job,
    }))
    .sort((left, right) => left.start.localeCompare(right.start) || right.end.localeCompare(left.end) || left.item.title.localeCompare(right.item.title));
}

export function buildCalendarRangeWeeks(dayKeys: string[], ranges: CalendarJobRange[]): CalendarRangeWeek[] {
  const weeks: CalendarRangeWeek[] = [];

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
