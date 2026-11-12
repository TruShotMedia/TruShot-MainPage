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
const event = (id: string, start: string, end: string, date = "2026-11-10"): CalendarCustomEvent => ({ id, entity_type: "calendar-event", title: id, client_id: "apg", client_name: "Autopacific Group", start_date: date, end_date: date, start_time: start, end_time: end, is_all_day: false, location: null, description: null, color: "#579", reminder_offsets_minutes: [], created_at: "", updated_at: "" });
const data = { calendarJobs: [], calendarTasks: [], flightEvents: [], calendarEvents: [event("Late meeting", "15:00", "16:00"), event("Early shoot", "09:00", "11:00"), event("Other day", "12:00", "13:00", "2026-11-12")] };
let container: HTMLDivElement, root: Root;
const callbacks = { onOpenItem: vi.fn(), onOpenEvent: vi.fn(), onOpenFlight: vi.fn(), onCreate: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", vi.fn()); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(marketing = false, readOnly = false) { await act(async () => root.render(<ProductionCalendar data={data} today="2026-11-10" marketing={marketing} readOnly={readOnly} {...callbacks} />)); }
const click = async (selector: string) => { await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click()); };
const hybrid = async () => { await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Hybrid")!.click()); };
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
  const stored = JSON.stringify({ version: 1, mode: "day", date: "2026-12-01", anchor: "2026-12-01" });
  localStorage.setItem(key, stored);
  await render();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value).toBe("2026-12-01");
  expect(localStorage.getItem(key)).toBe(stored);
});

it("hydrates server markup safely before restoring the device's saved view", async () => {
  const key = calendarViewStorageKey("autopacific", "local", "videographer", false);
  localStorage.setItem(key, JSON.stringify({ version: 1, mode: "day", date: "2026-12-01", anchor: "2026-12-01" }));
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
