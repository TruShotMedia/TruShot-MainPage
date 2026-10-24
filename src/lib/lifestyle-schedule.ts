import { addDays, addMinutes, differenceInCalendarDays, format, getISODay, isBefore, parse, startOfWeek } from "date-fns";
import type { LifestyleWorkoutDefinition } from "@/lib/lifestyle";

export type LifestyleBusyWindow = {
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  label: string;
};

export type LifestyleScheduleInput = {
  startDate: string;
  weeks: number;
  daysPerWeek: number;
  preferredDays: number[];
  preferredStartTime: string;
  durationMinutes: number;
  busyWindows: LifestyleBusyWindow[];
  program: LifestyleWorkoutDefinition[];
};

export type LifestyleScheduledWorkout = {
  sessionDate: string;
  startTime: string;
  endTime: string;
  workout: LifestyleWorkoutDefinition;
  sequenceIndex: number;
  schedulingNote: string;
};

const TIME_FORMAT = "HH:mm";
const SLOT_OFFSETS_MINUTES = [0, -60, 60, -120, 120, -180, 180];

function timeToMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function selectTimeForDay(
  date: string,
  preferredStartTime: string,
  durationMinutes: number,
  windows: LifestyleBusyWindow[],
) {
  const preferredMinutes = timeToMinutes(preferredStartTime);
  const sameDayWindows = windows.filter((window) => window.date === date);
  const hasAllDayConflict = sameDayWindows.some((window) => window.allDay);
  const candidates = SLOT_OFFSETS_MINUTES
    .map((offset) => preferredMinutes + offset)
    .filter((minutes) => minutes >= 5 * 60 + 30 && minutes + durationMinutes <= 21 * 60 + 30);

  for (const candidate of candidates) {
    const blocked = sameDayWindows.some((window) => {
      if (window.allDay || !window.startTime) return false;
      const busyStart = timeToMinutes(window.startTime);
      const busyEnd = window.endTime ? timeToMinutes(window.endTime) : busyStart + 90;
      return overlaps(candidate, candidate + durationMinutes, busyStart - 30, busyEnd + 30);
    });
    if (!blocked) {
      return {
        startTime: minutesToTime(candidate),
        endTime: minutesToTime(candidate + durationMinutes),
        penalty: hasAllDayConflict ? 120 : Math.abs(candidate - preferredMinutes) / 10,
        shifted: candidate !== preferredMinutes,
        allDayConflict: hasAllDayConflict,
      };
    }
  }

  return {
    startTime: minutesToTime(preferredMinutes),
    endTime: minutesToTime(preferredMinutes + durationMinutes),
    penalty: 500,
    shifted: false,
    allDayConflict: hasAllDayConflict,
  };
}

function combinations<T>(values: T[], count: number): T[][] {
  if (count === 0) return [[]];
  if (values.length < count) return [];
  const [first, ...rest] = values;
  return [
    ...combinations(rest, count - 1).map((items) => [first, ...items]),
    ...combinations(rest, count),
  ];
}

function dayPreferencePenalty(isoDay: number, preferredDays: number[]) {
  if (preferredDays.includes(isoDay)) return 0;
  return Math.min(...preferredDays.map((preferred) => Math.abs(preferred - isoDay))) * 18;
}

export function buildLifestyleSchedule(input: LifestyleScheduleInput): LifestyleScheduledWorkout[] {
  const start = parse(input.startDate, "yyyy-MM-dd", new Date());
  const firstWeek = startOfWeek(start, { weekStartsOn: 1 });
  const results: LifestyleScheduledWorkout[] = [];
  let sequenceIndex = 0;
  let previousDate: Date | null = null;

  for (let weekIndex = 0; weekIndex < input.weeks; weekIndex += 1) {
    const weekStart = addDays(firstWeek, weekIndex * 7);
    const dayCandidates = Array.from({ length: 7 }, (_, index) => {
      const dateObject = addDays(weekStart, index);
      const date = format(dateObject, "yyyy-MM-dd");
      const slot = selectTimeForDay(date, input.preferredStartTime, input.durationMinutes, input.busyWindows);
      return { dateObject, date, isoDay: getISODay(dateObject), slot };
    }).filter((candidate) => !isBefore(candidate.dateObject, start));

    const possible = combinations(dayCandidates, Math.min(input.daysPerWeek, dayCandidates.length));
    const selected = possible
      .map((set) => {
        let penalty = set.reduce((sum, candidate) => (
          sum + dayPreferencePenalty(candidate.isoDay, input.preferredDays) + candidate.slot.penalty
        ), 0);
        for (let index = 1; index < set.length; index += 1) {
          const gap = differenceInCalendarDays(set[index].dateObject, set[index - 1].dateObject);
          if (gap === 1) penalty += input.daysPerWeek <= 3 ? 90 : 22;
          if (gap >= 4) penalty += 12;
        }
        if (previousDate && set[0]) {
          const boundaryGap = differenceInCalendarDays(set[0].dateObject, previousDate);
          if (boundaryGap === 1) penalty += input.daysPerWeek <= 3 ? 70 : 18;
        }
        return { set, penalty };
      })
      .sort((left, right) => left.penalty - right.penalty)[0]?.set ?? [];

    selected.forEach((candidate) => {
      const workout = input.program[sequenceIndex % input.program.length];
      const noteParts = ["Placed around your existing calendar"];
      if (candidate.slot.shifted) noteParts.push("time adjusted to avoid a clash");
      if (candidate.slot.allDayConflict) noteParts.push("busy-day fallback");
      results.push({
        sessionDate: candidate.date,
        startTime: candidate.slot.startTime,
        endTime: candidate.slot.endTime,
        workout,
        sequenceIndex,
        schedulingNote: noteParts.join(" · "),
      });
      sequenceIndex += 1;
      previousDate = candidate.dateObject;
    });
  }

  return results;
}

export function sessionTimestamp(date: string, time: string, timezoneOffset = "+10:00") {
  return new Date(`${date}T${time.slice(0, 5)}:00${timezoneOffset}`);
}

export function shiftTime(time: string, minutes: number) {
  const parsed = parse(time.slice(0, 5), TIME_FORMAT, new Date(2000, 0, 1));
  return format(addMinutes(parsed, minutes), TIME_FORMAT);
}

