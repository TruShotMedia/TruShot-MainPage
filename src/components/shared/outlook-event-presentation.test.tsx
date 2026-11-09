// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/shared/calendar-weather", () => ({ useCalendarWeather: () => ({ days: [], unavailable: false }), CalendarWeatherBadge: () => null, CalendarWeatherCredit: () => null, CalendarWeatherDetails: () => null, WeatherIcon: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { TimedSchedule } from "@/components/autopacific/production-calendar";
import { ProductionMobileSchedule } from "@/components/autopacific/production-mobile-schedule";
import type { CalendarCustomEvent } from "@/lib/types";
const outlook: CalendarCustomEvent = { id: "outlook-private", entity_type: "calendar-event", external_source: "outlook", external_calendar_name: "Work Outlook", title: "Team planning", start_date: "2026-11-10", start_time: "09:00", end_date: "2026-11-10", end_time: "10:00", is_all_day: false, description: null, location: null, client_id: null, client_name: null, reminder_offsets_minutes: [], color: "#647b91", created_at: "", updated_at: "" };
const native = { ...outlook, id: "native", external_source: undefined, title: "Native event", start_time: "11:00", end_time: "12:00" };
const data = { calendarJobs: [], calendarTasks: [], calendarEvents: [outlook, native], flightEvents: [] };
let container: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("brands Outlook in the desktop timeline without branding native events", async () => {
  const onOpen = vi.fn();
  await act(async () => root.render(<TimedSchedule data={data} dates={["2026-11-10"]} today="2026-11-10" onOpen={onOpen} />));
  expect(container.querySelectorAll('.timetable-booking[data-calendar-source="outlook"]')).toHaveLength(1);
  expect(container.querySelectorAll('.outlook-event-mark')).toHaveLength(1);
  const card = container.querySelector<HTMLButtonElement>('[data-calendar-source="outlook"]')!;
  await act(async () => card.click());
  expect(onOpen).toHaveBeenCalledWith(outlook);
});
it("uses the same brand mark on mobile timed and all-day cards", async () => {
  const allDay = { ...outlook, id: "outlook-all-day", title: "Outlook all-day event", is_all_day: true, start_time: null, end_time: null };
  await act(async () => root.render(<ProductionMobileSchedule data={{ ...data, calendarEvents: [...data.calendarEvents, allDay] }} today="2026-11-10" todayOnly marketing={false} onOpen={vi.fn()} />));
  expect(container.querySelectorAll('[data-calendar-source="outlook"]')).toHaveLength(2);
  expect(container.querySelectorAll('.outlook-event-mark')).toHaveLength(2);
  expect(container.querySelector('.apg-mobile-timeline [data-calendar-source="outlook"]')).not.toBeNull();
  expect(container.querySelector('.apg-mobile-all-day [data-calendar-source="outlook"]')).not.toBeNull();
});
