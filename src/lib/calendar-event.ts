export type CalendarEventWindow = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isAllDay: boolean;
};

export function calendarEventWindowError(window: CalendarEventWindow) {
  if (window.endDate < window.startDate) return "The event cannot finish before it starts.";
  if (window.isAllDay) return null;
  if (!window.startTime || !window.endTime) return "Timed events need both a start and finish time.";
  if (window.endDate === window.startDate && window.endTime <= window.startTime) {
    return "The event must finish after its start time.";
  }
  return null;
}
