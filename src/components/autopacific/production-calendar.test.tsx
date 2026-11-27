// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SavedCalendarWeather } from "@/lib/calendar-weather";
const weather = vi.hoisted(() => vi.fn<(...args: unknown[]) => { days: SavedCalendarWeather[]; unavailable: boolean }>());
vi.mock("@/components/shared/calendar-weather", () => ({ useCalendarWeather: weather, CalendarWeatherBadge: () => null, CalendarWeatherCredit: () => null,
  CalendarWeatherDetails: ({ day }: { day: SavedCalendarWeather }) => <div role="dialog">{day.summary}</div>, WeatherIcon: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ProductionCalendar } from "./production-calendar";
import { ProductionDayPane } from "./production-day-pane";
import { CalendarPostCompletion } from "@/components/shared/calendar-post-completion";
import type { CalendarCustomEvent, CalendarJob } from "@/lib/types";
import { calendarViewStorageKey } from "@/lib/calendar-view-memory";
import { ProductionTeamProvider } from "./team-context";
import type { TeamContextData } from "@/lib/production-team";
import type { CalendarTask } from "@/lib/types";
const event = (id: string, start: string, end: string, date = "2026-11-10"): CalendarCustomEvent => ({ id, entity_type: "calendar-event", title: id, client_id: "apg", client_name: "Autopacific Group", start_date: date, end_date: date, start_time: start, end_time: end, is_all_day: false, location: null, description: null, color: "#579", reminder_offsets_minutes: [], created_at: "", updated_at: "" });
const data = { calendarJobs: [], calendarTasks: [], flightEvents: [], calendarEvents: [event("Late meeting", "15:00", "16:00"), event("Early shoot", "09:00", "11:00"), event("Other day", "12:00", "13:00", "2026-11-12")] };
let container: HTMLDivElement, root: Root;
const callbacks = { onOpenItem: vi.fn(), onOpenEvent: vi.fn(), onOpenFlight: vi.fn(), onCreate: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); weather.mockReturnValue({ days: [], unavailable: false }); localStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", vi.fn()); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(marketing = false, readOnly = false) { await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-10" marketing={marketing} readOnly={readOnly} {...callbacks} />)); }
const click = async (selector: string) => { await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click()); };
const hybrid = async () => { await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Hybrid")!.click()); };
const chooseMode = async (mode: string) => {
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === mode)!.click());
};

it.each(["Day", "Week"])("only places actually overlapping desktop %s bookings side by side", async mode => {
  const fixture = { ...data, calendarEvents: [
    event("Shoot", "09:00", "13:20"),
    { ...event("Outlook catch-up", "09:30", "10:00"), external_source: "outlook" as const },
    event("Short handover", "13:20", "13:30"),
    { ...event("Outlook planning", "13:30", "15:00"), external_source: "outlook" as const },
  ] };
  await act(async () => root.render(<ProductionCalendar data={fixture} today="2026-11-10" marketing={mode === "Week"} readOnly={mode === "Week"} {...callbacks} />));
  await chooseMode(mode);
  const cards = [...container.querySelectorAll<HTMLButtonElement>(".timetable-booking")];
  expect(cards.map(card => card.style.width)).toEqual(["calc(50% - 4px)", "calc(50% - 4px)", "calc(100% - 4px)", "calc(100% - 4px)"]);
  expect(cards[0].style.left).not.toBe(cards[1].style.left);
  expect(cards[2].style.left).toBe(cards[3].style.left);
  expect(parseFloat(cards[2].style.top) + parseFloat(cards[2].style.height)).toBeCloseTo(parseFloat(cards[3].style.top));
});

it.each([false, true])("defaults desktop to a five-day Week with today's scoped forecast and deadlines (marketing=%s)", async marketing => {
  const today = "2026-11-10";
  const location = marketing ? "melbourne-city" : "brisbane-city";
  weather.mockReturnValue({ unavailable: false, days: [{
    date: today, week_start: "2026-11-09", capture_kind: "weekly", location_key: location, condition: "rain", summary: "Rain showers",
    temperatureMin: 18, temperatureMax: 26, windMaxKmh: 22, captured_at: "2026-11-08T10:00:00Z", forecast_issued_at: "2026-11-08T09:00:00Z",
  }] });
  const job: CalendarJob = { id: "planning", title: "Campaign brief", entity_type: "job", client_name: "Autopacific Group", shoot_date: null, shoot_time: null,
    due_date: today, due_time: null, status_label: "Planning", status_color: "#579", is_complete: false };
  const task: CalendarTask = { id: "asset", title: "Hero edit", entity_type: "task", client_name: job.client_name, job_title: job.title,
    due_date: today, due_time: "10:00:00", priority: "normal", status_label: "In Progress", status_color: "#579", is_complete: false };
  const fixture = { ...data, calendarJobs: [job], calendarTasks: [task, { ...task, id: "yesterday", title: "Overdue asset", due_date: "2026-11-09" },
    { ...task, id: "tomorrow", title: "Tomorrow asset", due_date: "2026-11-11" }, { ...task, id: "done", title: "Finished asset", is_complete: true }],
    calendarEvents: [...data.calendarEvents, event("Weekend only", "10:00", "11:00", "2026-11-14")] };
  await act(async () => root.render(<ProductionCalendar data={fixture} today={today} marketing={marketing} readOnly={marketing} {...callbacks} />));
  expect(container.querySelector('[aria-label="Schedule view"] [aria-pressed="true"]')?.textContent).toBe("Week");
  expect([...container.querySelectorAll(".timetable-day-labels strong")].map(label => label.textContent)).toEqual(["Mon 9 Nov", "Tue 10 Nov", "Wed 11 Nov", "Thu 12 Nov", "Fri 13 Nov"]);
  expect(container.textContent).not.toContain("Weekend only");
  const panel = container.querySelector('[aria-label="Today at a glance"]')!;
  expect(panel.querySelector('time[aria-label="Current Brisbane time"]')?.textContent).toMatch(/\d{1,2}:\d{2} [AP]M/);
  expect(weather).toHaveBeenLastCalledWith(today, today, location);
  expect(panel.textContent).toContain("26° / 18°");
  const deadlines = [...panel.querySelectorAll<HTMLButtonElement>('[aria-label="Today\'s deadlines"] button')];
  expect(deadlines.map(button => button.querySelector("strong")?.textContent)).toEqual(["Hero edit", "Campaign brief", "Finished asset"]);
  expect(deadlines[2].textContent).toContain("Done");
  await act(async () => deadlines[0].click());
  expect(callbacks.onOpenItem).toHaveBeenCalledWith(task);
  await act(async () => panel.querySelector<HTMLButtonElement>('button[aria-label^="Today\'s forecast"]')!.click());
  expect(panel.querySelector('[role="dialog"]')?.textContent).toBe("Rain showers");
});

it("uses the mini month to jump weeks without changing what counts as today", async () => {
  await render();
  const mini = container.querySelector('[aria-label="Mini month calendar"]')!;
  expect(mini.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  expect(mini.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Tuesday 10 November 2026");
  expect(mini.querySelectorAll('[aria-label^="Saturday"],[aria-label^="Sunday"]')).toHaveLength(0);
  await click('[aria-label="Next month"]');
  expect(mini.querySelector("h3")?.textContent).toBe("December 2026");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value).toBe("2026-11-10");
  await click('[aria-label="Tuesday 15 December 2026"]');
  expect(container.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value).toBe("2026-12-15");
  expect(container.querySelector(".timetable-day-labels strong")?.textContent).toBe("Mon 14 Dec");
  expect(mini.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Tuesday 15 December 2026");
  expect(container.querySelector('[aria-label="Today at a glance"]')?.textContent).toContain("Today · Tue 10 Nov");
  expect(weather).toHaveBeenLastCalledWith("2026-11-10", "2026-11-10", "brisbane-city");
});

it("opens the next workweek on desktop when today is Saturday but keeps the panel date", async () => {
  await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-14" marketing={false} {...callbacks} />));
  expect(container.querySelector(".timetable-day-labels strong")?.textContent).toBe("Mon 16 Nov");
  expect(container.querySelector('[aria-label="Today at a glance"]')?.textContent).toContain("Today · Sat 14 Nov");
  expect(container.querySelector(".timetable-current-time")).toBeNull();
});

it.each([false, true])("tracks the Brisbane minute within the current Week grid (marketing=%s)", async marketing => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T04:20:00Z"));
  try {
    await render(marketing, marketing);
    const marker = () => container.querySelector<HTMLElement>(".timetable-hours > .timetable-current-time");
    expect(marker()?.querySelector("time")?.textContent).toBe("2:20 PM");
    expect(marker()?.querySelector("time")?.getAttribute("datetime")).toBe("14:20");
    expect(parseFloat(marker()!.style.top)).toBeCloseTo(380 * 64 / 60);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(marker()?.textContent).toBe("2:21 PM");
    expect(parseFloat(marker()!.style.top)).toBeCloseTo(381 * 64 / 60);
    await click('[aria-label="Next schedule period"]');
    expect(marker()).toBeNull();
    await click('[aria-label="Previous schedule period"]');
    expect(marker()?.textContent).toBe("2:21 PM");
    await chooseMode("Day");
    expect(marker()).toBeNull();
  } finally { vi.useRealTimers(); }
});

it("shows the marker outside the standard grid only when all hours are visible", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T12:30:00Z"));
  try {
    await render(true, true);
    expect(container.querySelector(".timetable-current-time")).toBeNull();
    const toggle = [...container.querySelectorAll("button")].find(button => button.textContent === "Show all 24 hours")!;
    await act(async () => toggle.click());
    expect(container.querySelector(".timetable-current-time")?.textContent).toBe("10:30 PM");
  } finally { vi.useRealTimers(); }
});

it("hydrates the Week grid without a mismatch when the clock crosses into the visible hours", async () => {
  vi.useFakeTimers();
  try {
    const calendar = <ProductionCalendar data={data} today="2026-11-10" marketing={false} {...callbacks} />;
    vi.setSystemTime(new Date("2026-11-09T21:59:00Z"));
    const html = renderToString(calendar);
    expect(html).not.toContain("timetable-current-time");
    await act(async () => root.unmount());
    container.innerHTML = html;
    vi.setSystemTime(new Date("2026-11-09T22:00:00Z"));
    const errors: unknown[] = [];
    await act(async () => { root = hydrateRoot(container, calendar, { onRecoverableError: error => errors.push(error) }); });
    expect(errors).toEqual([]);
    expect(container.querySelector(".timetable-current-time")?.textContent).toBe("8:00 AM");
  } finally { vi.useRealTimers(); }
});

it.each([[false, false], [false, true], [true, false], [true, true]])(
  "shows the videographer's working hours on Day and preserves bookings outside them (marketing=%s, mobile=%s)",
  async (marketing, mobile) => {
    const team: TeamContextData = { userId: "john", videographerId: "john", role: "manager", canManage: true, members: [] };
    const fixture = { ...data, calendarEvents: [
      event("Before work", "06:15", "06:45", "2026-11-12"),
      event("After work", "17:30", "18:30", "2026-11-12"),
    ] };
    await act(async () => root.render(<ProductionTeamProvider value={team}>
      <ProductionCalendar data={fixture} today="2026-11-11" marketing={marketing} mobile={mobile} personalTools {...callbacks} />
    </ProductionTeamProvider>));
    await chooseMode("Day");
    await click('[aria-label="Next schedule period"]');
    const band = () => container.querySelector<HTMLElement>("[data-working-hours-band]");
    expect(container.textContent).toContain("My working hours");
    expect(container.textContent).toContain("7:00 AM–4:15 PM · Brisbane time");
    expect(band()?.style.top).toBe(mobile ? "60px" : "64px");
    expect(band()?.style.height).toBe(mobile ? "555px" : "592px");
    const after = container.querySelector<HTMLButtonElement>('button[aria-label^="After work,"]');
    expect(container.textContent).toContain("Before work");
    await act(async () => after?.click());
    expect(callbacks.onOpenEvent).toHaveBeenCalledExactlyOnceWith(fixture.calendarEvents[1]);
    await click('[aria-label="Next schedule period"]');
    expect(container.textContent).toContain("7:00 AM–12:15 PM · Brisbane time");
    expect(band()?.style.height).toBe(mobile ? "315px" : "336px");
    await click('[aria-label="Next schedule period"]');
    expect(container.textContent).toContain(mobile ? "Monday, 16 Nov" : "No working hours · Brisbane time");
    expect(Boolean(band())).toBe(mobile);
    await chooseMode("Week");
    expect(band()).toBeNull();
    expect(container.textContent).not.toContain("My working hours");
  },
);

it.each([false, true])("does not present the videographer's hours as a teammate's own (mobile=%s)", async mobile => {
  const team: TeamContextData = { userId: "nathan", videographerId: "john", role: "marketing", canManage: false, members: [] };
  await act(async () => root.render(<ProductionTeamProvider value={team}>
    <ProductionCalendar data={data} today="2026-11-10" marketing mobile={mobile} personalTools {...callbacks} />
  </ProductionTeamProvider>));
  await chooseMode("Day");
  expect(container.querySelector('[aria-label="Day schedule"],[aria-label="Hourly schedule"]')).not.toBeNull();
  expect(container.querySelector("[data-working-hours-band]")).toBeNull();
  expect(container.textContent).not.toContain("My working hours");
});

const moveFixture = { ...data, calendarEvents: [
  { ...data.calendarEvents[1], updated_at: "2026-11-09T00:42:00Z" },
  { ...data.calendarEvents[0], updated_at: "2026-11-09T00:42:00Z", external_source: "outlook" as const },
] };

it.each([
  [false, true], [true, true], [false, false], [true, false],
])("previews a Day time drop and only saves inside the time grid (mobile=%s, inside=%s)", async (mobile, inside) => {
  const day = "2026-11-10";
  const updatedAt = "2026-11-10T00:42:00Z";
  const fixture = { ...moveFixture, calendarEvents: [...moveFixture.calendarEvents,
    { ...event("Multi-day", "15:00", "09:00"), updated_at: updatedAt, end_date: "2026-11-11" },
    { ...event("All-day reminder", "09:00", "10:00"), updated_at: updatedAt, is_all_day: true, start_time: null, end_time: null },
  ] };
  const onMoveEvent = vi.fn().mockResolvedValue({ ok: true, dates: { start_date: day, end_date: day, updated_at: updatedAt, start_time: "09:45:00", end_time: "11:45:00" } });
  await act(async () => root.render(<ProductionCalendar data={fixture} today={day} marketing={mobile} mobile={mobile} personalTools onMoveEvent={onMoveEvent} {...callbacks} />));
  await chooseMode("Day");
  const grid = container.querySelector<HTMLElement>(mobile ? ".mobile-calendar-hour-events" : ".timetable-day-column")!;
  const movable = [...container.querySelectorAll<HTMLElement>("[data-calendar-movable]")];
  expect(movable).toHaveLength(1);
  const booking = movable[0];
  expect(booking.textContent).toContain("Early shoot");
  const rect = (left: number, top: number, width: number, height: number) => ({
    x: left, y: top, left, right: left + width, top, bottom: top + height, width, height, toJSON: () => ({}),
  });
  grid.getBoundingClientRect = () => rect(50, 100, 375, 560);
  booking.getBoundingClientRect = () => rect(55, 150, 180, 100);
  const dispatchPointer = async (target: EventTarget, phase: "start" | "move" | "end", clientX: number, clientY: number) => {
    const point = { clientX, clientY } as Touch;
    const event = mobile
      ? new TouchEvent({ start: "touchstart", move: "touchmove", end: "touchend" }[phase], { bubbles: true, cancelable: true, touches: phase === "end" ? [] : [point], changedTouches: [point] })
      : new MouseEvent({ start: "mousedown", move: "mousemove", end: "mouseup" }[phase], { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
    // Browsers keep touch events targeted at the original element throughout the gesture.
    await act(async () => (mobile ? booking : target).dispatchEvent(event));
  };
  const y = 175 + (mobile ? 45 : 48);
  const x = inside ? 120 : 460;
  await dispatchPointer(booking, "start", 120, 175);
  try {
    if (mobile) await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    else await dispatchPointer(document, "move", 120, 185);
    await dispatchPointer(document, "move", 120, y);
    expect(container.querySelector("[data-calendar-time-preview]")?.textContent).toBe("09:45–11:45");
    if (!inside) {
      await dispatchPointer(document, "move", x, y);
      expect(container.querySelector("[data-calendar-time-preview]")).toBeNull();
    }
  } finally {
    await dispatchPointer(document, "end", x, y);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
  }
  if (inside) {
    expect(onMoveEvent).toHaveBeenCalledExactlyOnceWith({
      id: "Early shoot", expectedUpdatedAt: fixture.calendarEvents[0].updated_at, from: day, to: day, startMinute: 585,
    });
    expect(container.querySelector(".calendar-move-status")?.textContent).toContain("09:45–11:45");
  } else expect(onMoveEvent).not.toHaveBeenCalled();
  expect(callbacks.onOpenEvent).not.toHaveBeenCalled();
});

it.each([false, true])("shows all 24 hours on request and never permits a team read-only drop (mobile=%s)", async mobile => {
  const onMoveEvent = vi.fn();
  await act(async () => root.render(<ProductionCalendar data={moveFixture} today="2026-11-10" marketing mobile={mobile} readOnly onMoveEvent={onMoveEvent} {...callbacks} />));
  await chooseMode("Day");
  const toggle = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Show all 24 hours")!;
  await act(async () => toggle.click());
  expect(container.querySelectorAll(mobile ? ".mobile-calendar-hour-line" : ".timetable-time-labels time")).toHaveLength(24);
  expect(toggle.textContent).toBe("Show fewer hours");
  expect(container.querySelector("[data-calendar-movable]")).toBeNull();
  expect(onMoveEvent).not.toHaveBeenCalled();
});

it.each([["Fortnight", false], ["Week", false], ["Hybrid", false], ["Week", true], ["Fortnight", true]])(
  "makes CRM events draggable, without making Outlook events movable (%s, mobile %s)",
  async (mode, mobile) => {
    const onMoveEvent = vi.fn();
    await act(async () => root.render(<ProductionCalendar data={moveFixture} today="2026-11-10" marketing={false} mobile={mobile} onMoveEvent={onMoveEvent} {...callbacks} />));
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === mode)!.click());
    const movable = [...container.querySelectorAll("[data-calendar-movable]")];
    expect(movable.length).toBeGreaterThan(0);
    expect(movable.every(card => card.textContent?.includes("Early shoot"))).toBe(true);
    await act(async () => root.render(<ProductionCalendar data={moveFixture} today="2026-11-10" marketing={false} mobile={mobile} readOnly onMoveEvent={onMoveEvent} {...callbacks} />));
    expect(container.querySelector("[data-calendar-movable]")).toBeNull();
  },
);

it.each([true, false])("highlights the hovered Week date and only moves if released on a date (%s)", async inside => {
  const onMoveEvent = vi.fn().mockResolvedValue({ ok: true, dates: { start_date: "2026-11-13", end_date: "2026-11-13", updated_at: "2026-11-10T00:42:00Z" } });
  await act(async () => root.render(<ProductionCalendar data={moveFixture} today="2026-11-10" marketing={false} onMoveEvent={onMoveEvent} {...callbacks} />));
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Week")!.click());
  const booking = container.querySelector<HTMLElement>(".timetable-booking[data-calendar-movable]")!;
  const columns = [...container.querySelectorAll<HTMLElement>(".timetable-day-column")];
  const rect = (x: number, y: number, width: number, height: number) => ({
    x, y, left: x, right: x + width, top: y, bottom: y + height, width, height, toJSON: () => ({}),
  });
  for (const [index, column] of columns.entries()) column.getBoundingClientRect = () => rect(index * 100 + 50, 100, 100, 500);
  booking.getBoundingClientRect = () => rect(155, 150, 90, 80);
  const mouse = async (target: EventTarget, kind: string, clientX: number, clientY: number) => {
    await act(async () => target.dispatchEvent(new MouseEvent(kind, { bubbles: true, cancelable: true, clientX, clientY, button: 0 })));
  };
  await mouse(booking, "mousedown", 175, 170);
  await mouse(document, "mousemove", 192, 171);
  await mouse(document, "mousemove", 485, 171);
  expect(columns[4].dataset.calendarDropOver).toBe("true");
  if (!inside) await mouse(document, "mousemove", 875, 171);
  await mouse(document, "mouseup", inside ? 485 : 875, 171);
  if (inside) {
    expect(onMoveEvent).toHaveBeenCalledExactlyOnceWith({
      id: "Early shoot", expectedUpdatedAt: moveFixture.calendarEvents[0].updated_at, from: "2026-11-10", to: "2026-11-13",
    });
    expect(container.querySelector('[role="status"].calendar-move-status')?.textContent).toContain("Fri 13 Nov");
  } else expect(onMoveEvent).not.toHaveBeenCalled();
  expect(callbacks.onOpenEvent).not.toHaveBeenCalled();
  // The sensor leaves a short-lived click guard installed after mouseup.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
});

it.each([false, true])("previews and saves the new Week time, including a diagonal drop (cross-day=%s)", async crossDay => {
  const from = "2026-11-10", to = crossDay ? "2026-11-13" : from;
  const onMoveEvent = vi.fn().mockResolvedValue({ ok: true, dates: { start_date: to, end_date: to,
    start_time: "09:45:00", end_time: "11:45:00", updated_at: "2026-11-12T00:00:00Z" } });
  await act(async () => root.render(<ProductionCalendar data={moveFixture} today={from} marketing={crossDay} onMoveEvent={onMoveEvent} {...callbacks} />));
  const booking = container.querySelector<HTMLElement>(".timetable-booking[data-calendar-movable]")!;
  const columns = [...container.querySelectorAll<HTMLElement>(".timetable-day-column")];
  const bounds = (x: number, y: number, width: number, height: number) => ({
    x, y, left: x, right: x + width, top: y, bottom: y + height, width, height, toJSON: () => ({}),
  });
  for (const [index, column] of columns.entries()) column.getBoundingClientRect = () => bounds(index * 100 + 50, 100, 100, 550);
  booking.getBoundingClientRect = () => bounds(155, 148, 90, 95);
  async function mouse(target: EventTarget, type: string, x: number, y: number) {
    await act(async () => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })));
  }
  const x = crossDay ? 485 : 175;
  await mouse(booking, "mousedown", 175, 175);
  try {
    await mouse(document, "mousemove", 175, 185);
    await mouse(document, "mousemove", x, 223);
    expect(columns[crossDay ? 4 : 1].querySelector("[data-calendar-time-preview]")?.textContent).toBe("09:45–11:45");
    expect(document.querySelector(".calendar-move-overlay")?.textContent).toContain("Early shoot");
  } finally {
    await mouse(document, "mouseup", x, 223);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
  }
  expect(onMoveEvent).toHaveBeenCalledExactlyOnceWith({ id: "Early shoot", expectedUpdatedAt: moveFixture.calendarEvents[0].updated_at, from, to, startMinute: 585 });
  expect(container.querySelector(".calendar-move-status")?.textContent).toContain(crossDay ? "Fri 13 Nov, 09:45–11:45" : "09:45–11:45");
  expect(callbacks.onOpenEvent).not.toHaveBeenCalled();
});

it.each([
  ["Day", "start", "save", "08:30–11:00", 510, "157px"],
  ["Week", "end", "save", "09:00–10:30", 630, "93px"],
  ["Week", "end", "cancel", "09:00–10:30", 630, "93px"],
  ["Day", "end", "reject", "09:00–10:30", 630, "93px"],
] as const)("resizes the booking in place (%s, %s, %s)", async (mode, edge, outcome, previewTime, minute, height) => {
  const date = "2026-11-10", updatedAt = "2026-11-12T00:00:00Z";
  const response = outcome === "reject"
    ? { ok: false, error: "This event changed. Refresh the calendar." } as const
    : { ok: true, dates: { start_date: date, end_date: date, updated_at: updatedAt } } as const;
  let completeSave!: (value: typeof response) => void;
  const onMoveEvent = vi.fn(() => new Promise<typeof response>(resolve => { completeSave = resolve; }));
  await act(async () => root.render(<ProductionCalendar data={moveFixture} today={date} marketing={mode === "Week"} onMoveEvent={onMoveEvent} {...callbacks} />));
  await chooseMode(mode);
  expect(container.querySelectorAll("[data-calendar-resizable]")).toHaveLength(1);
  expect(container.querySelectorAll("[data-calendar-resize-edge]")).toHaveLength(2);
  expect(container.querySelector('[data-calendar-source="outlook"] [data-calendar-resize-edge]')).toBeNull();
  const columns = [...container.querySelectorAll<HTMLElement>(".timetable-day-column")];
  const activeColumn = columns[mode === "Day" ? 0 : 1];
  const handle = activeColumn.querySelector<HTMLElement>(`[data-calendar-resize-edge="${edge}"]`)!;
  const booking = handle.closest<HTMLButtonElement>("button")!;
  const { top: originalTop, height: originalHeight, left, width } = booking.style;
  const box = (left: number, top: number, width: number, height: number) => ({
    x: left, y: top, left, right: left + width, top, bottom: top + height, width, height, toJSON: () => ({}),
  });
  for (const [index, column] of columns.entries()) column.getBoundingClientRect = () => box(index * 100 + 50, 100, 100, 540);
  const x = mode === "Day" ? 85 : 185, y = edge === "start" ? 164 : 290;
  handle.getBoundingClientRect = () => box(x - 20, y - 2, 70, 5);
  async function mouse(target: EventTarget, type: string, clientX: number, clientY: number) {
    await act(async () => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 })));
  }
  const endX = outcome === "cancel" ? x + 100 : x;
  await mouse(handle, "mousedown", x, y);
  try {
    await mouse(document, "mousemove", x, y - 9);
    await mouse(document, "mousemove", x, y - 32);
    const preview = activeColumn.querySelector<HTMLElement>("[data-calendar-resize-preview]");
    expect(preview).toBe(booking);
    expect(booking.querySelector("small")?.textContent).toBe(previewTime);
    expect(booking.style.height).toBe(height);
    expect(booking.style.left).toBe(left);
    expect(booking.style.width).toBe(width);
    if (edge === "start") expect(parseFloat(booking.style.top) + parseFloat(booking.style.height)).toBe(parseFloat(originalTop) + parseFloat(originalHeight));
    else expect(booking.style.top).toBe(originalTop);
    expect(document.querySelector(".calendar-move-overlay")).toBeNull();
    expect(container.querySelector("[data-calendar-time-preview]")).toBeNull();
    expect(container.querySelector("[data-calendar-dragging=true]")).toBeNull();
    if (outcome === "cancel") {
      await mouse(document, "mousemove", endX, y - 32);
      expect(container.querySelector("[data-calendar-resize-preview]")).toBeNull();
      expect(container.querySelector("[data-calendar-drop-over=true]")).toBeNull();
      expect(booking.style.height).toBe(originalHeight);
    }
  } finally {
    await mouse(document, "mouseup", endX, y - 32);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
  }
  if (outcome === "cancel") expect(onMoveEvent).not.toHaveBeenCalled();
  else {
    expect(onMoveEvent).toHaveBeenCalledExactlyOnceWith({ id: "Early shoot", expectedUpdatedAt: moveFixture.calendarEvents[0].updated_at, from: date, to: date, resize: { edge, minute } });
    expect(booking.querySelector("small")?.textContent).toBe(previewTime);
    expect(booking.style.height).toBe(height);
    expect(container.querySelector(".calendar-move-status")?.textContent).toBe("Updating event…");
    await act(async () => completeSave(response));
    expect(booking.hasAttribute("data-calendar-resize-preview")).toBe(false);
    expect(container.querySelector(".calendar-move-status")?.textContent).toContain(response.ok ? `Resized “Early shoot” to ${previewTime}` : response.error);
    if (!response.ok) {
      expect(booking.style.height).toBe(originalHeight);
      expect(booking.querySelector("small")?.textContent).toBe("09:00–11:00");
    }
  }
  expect(callbacks.onOpenEvent).not.toHaveBeenCalled();
});

it.each([[true, false], [false, true]])("does not show resize handles on mobile or in read-only calendars (mobile=%s, read-only=%s)", async (mobile, readOnly) => {
  await act(async () => root.render(<ProductionCalendar data={moveFixture} today="2026-11-10" marketing mobile={mobile} readOnly={readOnly} onMoveEvent={vi.fn()} {...callbacks} />));
  await chooseMode("Day");
  expect(container.querySelector("[data-calendar-resize-edge]")).toBeNull();
});

it("moves on a touch hold and drop onto a mobile Week row", async () => {
  const onMoveEvent = vi.fn().mockResolvedValue({ ok: true, dates: { start_date: "2026-11-13", end_date: "2026-11-13", updated_at: "2026-11-10T00:42:00Z" } });
  await act(async () => root.render(<ProductionCalendar data={moveFixture} today="2026-11-10" marketing mobile personalTools onMoveEvent={onMoveEvent} {...callbacks} />));
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Week")!.click());
  const booking = container.querySelector<HTMLElement>(".mobile-calendar-overview [data-calendar-movable]")!;
  const days = [...container.querySelectorAll<HTMLElement>(".mobile-calendar-overview-day")];
  const rect = (left: number, top: number, width: number, height: number) => ({
    x: left, y: top, left, right: left + width, top, bottom: top + height, width, height, toJSON: () => ({}),
  });
  for (const [index, day] of days.entries()) day.getBoundingClientRect = () => rect(index * 48, 100, 46, 55);
  booking.getBoundingClientRect = () => rect(60, 230, 290, 50);
  const touch = async (target: EventTarget, kind: string, x: number, y: number) => {
    const point = { clientX: x, clientY: y } as Touch;
    await act(async () => target.dispatchEvent(new TouchEvent(kind, {
      bubbles: true, cancelable: true, touches: kind === "touchend" ? [] : [point], changedTouches: [point],
    })));
  };
  await touch(booking, "touchstart", 175, 240);
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    await touch(booking, "touchmove", 205, 123);
    expect(days[4].dataset.calendarDropOver).toBe("true");
  } finally {
    await touch(booking, "touchend", 205, 123);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
  }
  expect(onMoveEvent).toHaveBeenCalledExactlyOnceWith({ id: "Early shoot", expectedUpdatedAt: moveFixture.calendarEvents[0].updated_at, from: "2026-11-10", to: "2026-11-13" });
  expect(days[4].classList.contains("is-selected")).toBe(true);
});

it.each(["Fortnight", "Week", "Day", "Hybrid", "Mobile"])("keeps shared assignee colours and completed status in the Marketing Team %s view", async mode => {
  const team: TeamContextData = { userId: "nathan", role: "marketing", canManage: false, videographerId: "john", members: [
    { user_id: "john", display_name: "John", username: "john", role: "manager", is_active: true, avatar_color: "#579" },
    { user_id: "nathan", display_name: "Nathan", username: "nathan", role: "marketing", is_active: true, avatar_color: "#579" },
  ] };
  const shared: CalendarJob = { id: "shared", entity_type: "job", title: "Shared shoot", client_name: "Autopacific Group", shoot_date: "2026-11-10", shoot_time: "09:00", shoot_end_time: "11:00", due_date: "2026-11-13", due_time: null, status_label: "Scheduled", status_color: "#579", is_complete: false, assignee_ids: ["john", "nathan"] };
  const complete: CalendarTask = { id: "done", entity_type: "task", title: "Completed asset", job_title: shared.title, client_name: shared.client_name, due_date: "2026-11-10", due_time: null, status_label: "Complete", status_color: "#397253", is_complete: true, assignee_ids: ["nathan"], priority: "normal" };
  await act(async () => root.render(<ProductionTeamProvider value={team}><ProductionCalendar data={{ ...data, calendarJobs: [shared], calendarTasks: [complete] }} today="2026-11-10" marketing readOnly mobile={mode === "Mobile"} {...callbacks} /></ProductionTeamProvider>));
  if (mode !== "Mobile") await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === mode)!.click());
  const markers = [...container.querySelectorAll('.calendar-team-marker[aria-label="Assigned to John, Nathan"]')];
  expect(markers.length).toBeGreaterThan(0);
  expect(markers.every(marker => marker.querySelectorAll("i").length === 2)).toBe(true);
  expect(new Set([...markers[0].querySelectorAll<HTMLElement>("i")].map(node => node.style.getPropertyValue("--calendar-person-color"))).size).toBe(2);
  expect(container.querySelector('[data-team-calendar="true"].is-complete, [data-team-calendar="true"][data-tone="complete"]')).not.toBeNull();
  expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull();
});
it.each([false, true])("offers the four views in production/marketing and selects a day without editing (%s)", async marketing => {
  await render(marketing);
  expect([...container.querySelectorAll('[aria-label="Schedule view"] button')].map(button => button.textContent)).toEqual(["Fortnight", "Week", "Day", "Hybrid"]);
  await hybrid();
  expect(container.querySelectorAll(".tablet-calendar-day-select")).toHaveLength(14);
  const datesBefore = [...container.querySelectorAll(".tablet-calendar-day-select time")].map(node => node.getAttribute("datetime"));
  await click('[aria-label="Show schedule for Thursday 12 November 2026"]');
  expect(container.querySelector('[aria-label="Selected day schedule"] h2')?.textContent).toBe("Thursday");
  expect(container.querySelector('[aria-label="Selected day schedule"]')?.textContent).toContain("Other day");
  expect(container.querySelector('[aria-label="Selected day schedule"]')?.textContent).not.toContain("Early shoot");
  expect([...container.querySelectorAll(".tablet-calendar-day-select time")].map(node => node.getAttribute("datetime"))).toEqual(datesBefore);
  expect(container.querySelector('.is-selected-day time')?.getAttribute("datetime")).toBe("2026-11-12");
  expect(callbacks.onOpenEvent).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Selected day schedule"] [aria-haspopup="menu"]')).toBeNull();
  await click('.production-calendar-views [aria-haspopup="menu"]');
  expect(callbacks.onCreate).not.toHaveBeenCalled();
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent === "Calendar event")!.click());
  expect(callbacks.onCreate).toHaveBeenCalledWith("event", "2026-11-12");
});
it("follows fortnight navigation, keeps the day selection in view, and returns to today", async () => {
  await render(); await hybrid();
  await click('[aria-label="Next calendar period"]');
  expect(container.querySelector('[aria-label="Selected day schedule"] time')?.getAttribute("datetime")).toBe("2026-11-24");
  expect(container.querySelector('.tablet-calendar-day-select[aria-pressed="true"] time')?.getAttribute("datetime")).toBe("2026-11-24");
  await click('[aria-label="Previous calendar period"]');
  await click('[aria-label="Previous selected day"]');
  await click('[aria-label="Previous selected day"]');
  expect(container.querySelector('.tablet-calendar-day-select[aria-pressed="true"] time')?.getAttribute("datetime")).toBe("2026-11-08");
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Selected day schedule"] button')].find(button => button.textContent === "Today")!.click());
  expect(container.querySelector('[aria-label="Selected day schedule"] time')?.getAttribute("datetime")).toBe("2026-11-10");
});
it("preserves the displayed fortnight when switching between Fortnight and Hybrid", async () => {
  await render(); await chooseMode("Fortnight"); await click('[aria-label="Next calendar period"]'); await hybrid();
  expect(container.querySelector('.tablet-calendar-day-select[aria-pressed="true"] time')?.getAttribute("datetime")).toBe("2026-11-24");
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Day")!.click());
  expect(container.querySelector('[aria-label="Day schedule"]')).not.toBeNull();
  await hybrid(); expect(container.querySelector('[aria-label="Selected day schedule"] time')?.getAttribute("datetime")).toBe("2026-11-24");
});
it("lists overlapping bookings in time order without hiding any, and routes clicks through existing handlers", async () => {
  await render(); await hybrid();
  const pane = container.querySelector('[aria-label="Selected day timed bookings"]')!;
  const buttons = [...pane.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons.map(button => button.querySelector("strong")?.textContent)).toEqual(["Early shoot", "Late meeting"]);
  await act(async () => buttons[0].click()); expect(callbacks.onOpenEvent).toHaveBeenCalledWith(data.calendarEvents[1]);
});
it("hides create controls in read-only mode but allows selection and inspecting details", async () => {
  await render(true, true); await hybrid();
  expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull(); expect(container.querySelector(".tablet-calendar-day-add")).toBeNull();
  await click('[aria-label="Show schedule for Thursday 12 November 2026"]');
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Selected day timed bookings"] button')!.click());
  expect(callbacks.onOpenEvent).toHaveBeenCalledWith(data.calendarEvents[2]);
});
it.each([false, true])("day plus opens choices rather than creating an event immediately (%s)", async marketing => {
  await render(marketing); await hybrid();
  await click('[aria-label="Add to calendar on 12 November 2026"]');
  expect(callbacks.onCreate).not.toHaveBeenCalled();
  const choices = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  expect(choices.map(button => button.textContent)).toEqual(marketing ? ["Job brief", "Calendar event", "Scheduled post"] : ["Job brief", "Calendar event", "Scheduled post", "Task / asset", "Flight plan"]);
  await act(async () => choices[2].click());
  expect(callbacks.onCreate).toHaveBeenCalledWith("post", "2026-11-12");
});
it("retains personal production tools for Marketing My Space and uses its selected mobile day", async () => {
  await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-10" marketing mobile personalTools {...callbacks} />));
  await click('[aria-label="Thursday 12 November"]');
  await click('[aria-label="Add to calendar on 12 November 2026"]');
  const choices = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  expect(choices.map(button => button.textContent)).toEqual(["Job brief", "Calendar event", "Scheduled post", "Task / asset", "Flight plan"]);
  await act(async () => choices[4].click());
  expect(callbacks.onCreate).toHaveBeenCalledWith("flight", "2026-11-12");
});
it.each([
  [false, "Week"], [false, "Day"], [false, "Fortnight"], [false, "Hybrid"],
  [true, "List"], [true, "Day"], [true, "Week"], [true, "Fortnight"], [true, "Month"],
] as const)("distinguishes posts from normal calendar entries (mobile=%s, %s)", async (mobile, mode) => {
  const post = { ...event("Launch reel goes live", "11:00", "11:15"), event_kind: "post" as const };
  const fixture = { ...data, calendarEvents: [...data.calendarEvents, post] };
  await act(async () => root.render(<ProductionCalendar data={fixture} today="2026-11-10" marketing mobile={mobile} {...callbacks} />));
  await chooseMode(mode);
  const marks = [...container.querySelectorAll(".calendar-post-mark")];
  expect(marks.length).toBeGreaterThan(0);
  expect(marks.every(mark => mark.closest("strong")?.textContent === post.title)).toBe(true);
  if (mode === "Day" || mode === "Week" && !mobile) {
    await act(async () => marks[0].closest("button")?.click());
    expect(callbacks.onOpenEvent).toHaveBeenCalledWith(post);
  }
});
it("shows an all-day post in the desktop Week all-day row", async () => {
  const post = { ...event("Launch day", "", ""), is_all_day: true, start_time: null, end_time: null, event_kind: "post" as const };
  await act(async () => root.render(<ProductionCalendar data={{ ...data, calendarEvents: [post] }} today="2026-11-10" marketing {...callbacks} />));
  const mark = container.querySelector(".timetable-all-day .calendar-post-mark");
  expect(mark?.closest("strong")?.textContent).toBe(post.title);
  expect(container.querySelector(".timetable-hours .calendar-post-mark")).toBeNull();
});
it.each([[false, "Week"], [false, "Day"], [false, "Hybrid"], [true, "Week"], [true, "Day"], [true, "List"], [true, "Month"]] as const)(
  "shows an independent post checkbox in %s %s",
  async (mobile, mode) => {
    const post = { ...event("Launch day", "11:00", "11:15"), event_kind: "post" as const };
    const fixture = { ...data, calendarEvents: [post, ...data.calendarEvents] };
    const toggle = vi.fn();
    await act(async () => root.render(<CalendarPostCompletion.Provider value={{ pendingId: null, toggle }}>
      <ProductionCalendar data={fixture} today="2026-11-10" marketing mobile={mobile} {...callbacks} />
    </CalendarPostCompletion.Provider>));
    await chooseMode(mode);
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].checked).toBe(false);
    await act(async () => boxes[0].click());
    expect(toggle).toHaveBeenCalledExactlyOnceWith(post);
    expect(callbacks.onOpenEvent).not.toHaveBeenCalled();
    await act(async () => boxes[0].closest(".calendar-post-control")?.querySelector("button")?.click());
    expect(callbacks.onOpenEvent).toHaveBeenCalledExactlyOnceWith(post);
  },
);
it.each([false, true])("toggles the post itself in Fortnight without checkboxes (mobile=%s)", async mobile => {
  const post = { ...event("Launch day", "", ""), event_kind: "post" as const, is_all_day: true, start_time: null, end_time: null };
  const toggle = vi.fn();
  const renderPost = async (completed: boolean, readOnly = false) => {
    const next = { ...post, post_completed_at: completed ? "2026-11-11T01:00:00Z" : null };
    await act(async () => root.render(<CalendarPostCompletion.Provider value={readOnly ? null : { pendingId: null, toggle }}>
      <ProductionCalendar data={{ ...data, calendarEvents: [next] }} today="2026-11-11" marketing mobile={mobile} readOnly={readOnly} {...callbacks} />
    </CalendarPostCompletion.Provider>));
    return next;
  };
  const open = await renderPost(false);
  await chooseMode("Fortnight");
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  expect(container.querySelector('[data-calendar-post-complete="true"]')).toBeNull();
  const press = async (label: string) => {
    const chip = container.querySelector<HTMLElement>(`${mobile ? ".apg-fortnight-range" : ".tablet-calendar-job-range"}[aria-label="${label}"]`)!;
    expect(chip).not.toBeNull();
    await act(async () => chip.click());
  };
  await press("Mark Launch day complete");
  expect(toggle).toHaveBeenLastCalledWith(open);
  expect(callbacks.onOpenEvent).not.toHaveBeenCalled();
  const completed = await renderPost(true);
  expect(container.querySelector('[aria-label="Scheduled post completed"]')).not.toBeNull();
  await press("Mark Launch day not complete");
  expect(toggle).toHaveBeenLastCalledWith(completed);
  await renderPost(true, true);
  expect(container.querySelector('[aria-pressed="true"][aria-label^="Mark Launch day"]')).toBeNull();
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
});
it("shows ongoing weekday work and native/Outlook themes without hiding completed work", async () => {
  const job: CalendarJob = { id: "ongoing", entity_type: "job", title: "Ongoing capture", client_name: "Autopacific Group", shoot_date: "2026-11-09", shoot_time: null, due_date: "2026-11-13", due_time: null, status_label: "Production", status_color: "#579", is_complete: false };
  const imported = { ...data.calendarEvents[1], id: "outlook", external_source: "outlook" as const };
  await act(async () => root.render(<ProductionDayPane data={{ ...data, calendarJobs: [job], calendarEvents: [imported, data.calendarEvents[0]] }} date="2026-11-10" today="2026-11-10" currentTime="17:00" onSelectDate={vi.fn()} onOpen={callbacks.onOpenEvent} />));
  expect(container.querySelector('[aria-label="Selected day all-day items"]')?.textContent).toContain("Ongoing capture");
  expect(container.querySelectorAll('[data-calendar-source="outlook"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-tone="complete"]')).toHaveLength(2);
});

it.each([false, true])("restores Hybrid, its fortnight and selected day after leaving the calendar (%s)", async marketing => {
  await render(marketing); await hybrid(); await click('[aria-label="Next calendar period"]');
  await click('[aria-label="Show schedule for Thursday 26 November 2026"]');
  await act(async () => root.render(null));
  await render(marketing);
  expect(container.querySelector('[aria-label="Schedule view"] [aria-pressed="true"]')?.textContent).toBe("Hybrid");
  expect(container.querySelector('[aria-label="Selected day schedule"] time')?.getAttribute("datetime")).toBe("2026-11-26");
  expect(container.querySelector('.tablet-calendar-day-select[aria-pressed="true"] time')?.getAttribute("datetime")).toBe("2026-11-26");
});

it("keeps the Today tab and Marketing preferences separate from the production calendar", async () => {
  await render(); await hybrid(); await click('[aria-label="Next calendar period"]');
  await act(async () => root.render(<ProductionCalendar key="today" data={data} today="2026-11-10" todayOnly marketing={false} {...callbacks} />));
  expect(container.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value).toBe("2026-11-10");
  await act(async () => root.render(null));
  await render(true);
  expect(container.querySelector('[aria-label="Schedule view"] [aria-pressed="true"]')?.textContent).toBe("Week");
  await act(async () => root.render(null));
  await render();
  expect(container.querySelector('[aria-label="Selected day schedule"] time')?.getAttribute("datetime")).toBe("2026-11-24");
});

it("remembers Week and Day navigation and tolerates unavailable local storage", async () => {
  await render();
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Week")!.click());
  await click('[aria-label="Next schedule period"]');
  await act(async () => root.render(null)); await render();
  expect(container.querySelector('[aria-label="Schedule view"] [aria-pressed="true"]')?.textContent).toBe("Week");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value).toBe("2026-11-17");
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Day")!.click());
  expect(container.querySelector('[aria-label="Day schedule"]')).not.toBeNull();
  storage.mockRestore();
});

it("does not overwrite saved preferences during hydration/mount", async () => {
  const key = calendarViewStorageKey("autopacific", "local", "videographer", false);
  const stored = JSON.stringify({ version: 1, mode: "day", date: "2026-12-01", anchor: "2026-12-01", viewedOn: "2026-11-10" });
  localStorage.setItem(key, stored);
  await render();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value).toBe("2026-12-01");
  expect(localStorage.getItem(key)).toBe(stored);
});

it("hydrates server markup safely before restoring the device's saved view", async () => {
  const key = calendarViewStorageKey("autopacific", "local", "videographer", false);
  localStorage.setItem(key, JSON.stringify({ version: 1, mode: "day", date: "2026-12-01", anchor: "2026-12-01", viewedOn: "2026-11-10" }));
  const calendar = <ProductionCalendar data={data} today="2026-11-10" marketing={false} {...callbacks} />;
  const html = renderToString(calendar);
  expect(html).not.toContain('aria-label="Day schedule"');
  await act(async () => root.unmount());
  container.innerHTML = html;
  const errors: unknown[] = [];
  await act(async () => { root = hydrateRoot(container, calendar, { onRecoverableError: error => errors.push(error) }); });
  expect(errors).toEqual([]);
  expect(container.querySelector('[aria-label="Day schedule"]')).not.toBeNull();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value).toBe("2026-12-01");
});

it.each([false, true])("keeps Hybrid but resets the selected day and fortnight on a later day (%s)", async marketing => {
  await render(marketing); await hybrid();
  await click('[aria-label="Next calendar period"]');
  await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-17" marketing={marketing} {...callbacks} />));
  expect(container.querySelector('[aria-label="Schedule view"] [aria-pressed="true"]')?.textContent).toBe("Hybrid");
  expect(container.querySelector('[aria-label="Selected day schedule"] time')?.getAttribute("datetime")).toBe("2026-11-17");
  expect(container.querySelector('.is-today time')?.getAttribute("datetime")).toBe("2026-11-17");
  expect(container.querySelector('.is-selected-day time')?.getAttribute("datetime")).toBe("2026-11-17");
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["fortnight", "week", "day", "hybrid"] as const)("reopens at today while remembering the saved %s view", async mode => {
  const key = calendarViewStorageKey("autopacific", "local", "videographer", false);
  localStorage.setItem(key, JSON.stringify({ version: 1, mode, date: "2026-12-01", anchor: "2026-12-01", viewedOn: "2026-11-10" }));
  await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-17" marketing={false} {...callbacks} />));
  expect(container.querySelector('[aria-label="Schedule view"] [aria-pressed="true"]')?.textContent?.toLowerCase()).toBe(mode);
  if (mode === "week" || mode === "day") expect(container.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value).toBe("2026-11-17");
  else expect(container.querySelector('.is-today time')?.getAttribute("datetime")).toBe("2026-11-17");
  if (mode === "hybrid") expect(container.querySelector('[aria-label="Selected day schedule"] time')?.getAttribute("datetime")).toBe("2026-11-17");
  // Deriving the current day never overwrites preferences or writes record data.
  expect(JSON.parse(localStorage.getItem(key)!).viewedOn).toBe("2026-11-10");
});

it("also rolls over the in-memory calendar when browser storage is unavailable", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  try {
    await render(); await hybrid(); await click('[aria-label="Next calendar period"]');
    await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-11" marketing={false} {...callbacks} />));
    expect(container.querySelector('[aria-label="Selected day schedule"] time')?.getAttribute("datetime")).toBe("2026-11-11");
    expect(container.querySelector('[aria-label="Schedule view"] [aria-pressed="true"]')?.textContent).toBe("Hybrid");
  } finally { storage.mockRestore(); }
});
