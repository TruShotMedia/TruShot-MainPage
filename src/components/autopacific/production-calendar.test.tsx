// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/shared/calendar-weather", () => ({ useCalendarWeather: () => ({ days: [], unavailable: false }), CalendarWeatherBadge: () => null, CalendarWeatherCredit: () => null, CalendarWeatherDetails: () => null, WeatherIcon: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ProductionCalendar } from "./production-calendar";
import { ProductionDayPane } from "./production-day-pane";
import type { CalendarCustomEvent, CalendarJob } from "@/lib/types";
import { calendarViewStorageKey } from "@/lib/calendar-view-memory";
import { ProductionTeamProvider } from "./team-context";
import type { TeamContextData } from "@/lib/production-team";
import type { CalendarTask } from "@/lib/types";
const event = (id: string, start: string, end: string, date = "2026-11-10"): CalendarCustomEvent => ({ id, entity_type: "calendar-event", title: id, client_id: "apg", client_name: "Autopacific Group", start_date: date, end_date: date, start_time: start, end_time: end, is_all_day: false, location: null, description: null, color: "#579", reminder_offsets_minutes: [], created_at: "", updated_at: "" });
const data = { calendarJobs: [], calendarTasks: [], flightEvents: [], calendarEvents: [event("Late meeting", "15:00", "16:00"), event("Early shoot", "09:00", "11:00"), event("Other day", "12:00", "13:00", "2026-11-12")] };
let container: HTMLDivElement, root: Root;
const callbacks = { onOpenItem: vi.fn(), onOpenEvent: vi.fn(), onOpenFlight: vi.fn(), onCreate: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", vi.fn()); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(marketing = false, readOnly = false) { await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-10" marketing={marketing} readOnly={readOnly} {...callbacks} />)); }
const click = async (selector: string) => { await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click()); };
const hybrid = async () => { await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Hybrid")!.click()); };
const chooseMode = async (mode: string) => {
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === mode)!.click());
};

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
  await render(); await click('[aria-label="Next calendar period"]'); await hybrid();
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
  expect(choices.map(button => button.textContent)).toEqual(marketing ? ["Job brief", "Calendar event"] : ["Job brief", "Calendar event", "Task / asset", "Flight plan"]);
  await act(async () => choices[0].click());
  expect(callbacks.onCreate).toHaveBeenCalledWith("job", "2026-11-12");
});
it("retains personal production tools for Marketing My Space and uses its selected mobile day", async () => {
  await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-10" marketing mobile personalTools {...callbacks} />));
  await click('[aria-label="Thursday 12 November"]');
  await click('[aria-label="Add to calendar on 12 November 2026"]');
  const choices = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  expect(choices.map(button => button.textContent)).toEqual(["Job brief", "Calendar event", "Task / asset", "Flight plan"]);
  await act(async () => choices[3].click());
  expect(callbacks.onCreate).toHaveBeenCalledWith("flight", "2026-11-12");
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
  expect(container.querySelector('[aria-label="Schedule view"] [aria-pressed="true"]')?.textContent).toBe("Fortnight");
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
