// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductionMobileSchedule } from "./production-mobile-schedule";
import type { CalendarCustomEvent, CalendarJob } from "@/lib/types";
const weather = vi.hoisted(() => vi.fn(() => ({ days: [], unavailable: false })));
vi.mock("@/components/shared/calendar-weather", () => ({ useCalendarWeather: weather, CalendarWeatherBadge: () => null, CalendarWeatherCredit: () => null, CalendarWeatherDetails: () => null }));
const event = (id: string, start_time: string, end_time: string): CalendarCustomEvent => ({ id, entity_type: "calendar-event", title: id, client_id: "apg", client_name: "Autopacific Group", start_date: "2026-10-28", end_date: "2026-10-28", start_time, end_time, is_all_day: false, location: null, description: null, color: "#579", reminder_offsets_minutes: [], created_at: "2026-10-28T00:00:00Z", updated_at: "2026-10-28T00:00:00Z" });
const data = { calendarJobs: [], calendarTasks: [], flightEvents: [], calendarEvents: [event("Workshop capture", "09:00", "11:00"), event("Review call", "09:30", "10:00")] };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe("mobile calendar and itinerary", () => {
  it("retains multi-day production windows but leaves AutoPacific weekends clear", async () => {
    const job: CalendarJob = { id: "shoot", entity_type: "job", title: "Multi-day project", client_name: "Autopacific Group", shoot_date: "2026-10-27", shoot_time: null, due_date: "2026-11-03", due_time: null, status_label: "Production", status_color: "#579", is_complete: false };
    await act(async () => root.render(<ProductionMobileSchedule data={{...data,calendarJobs:[job]}} today="2026-10-28" todayOnly={false} marketing={false} onOpen={() => {}} onCreate={() => {}} />));
    expect(container.querySelector(".apg-mobile-all-day")?.textContent).toContain("Multi-day project");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Saturday 31 October"]')!.click());
    expect(container.textContent).not.toContain("Multi-day project");
  });
  it("starts with seven days and lists overlapping bookings without hiding either", async () => {
    const open = vi.fn();
    await act(async () => root.render(<ProductionMobileSchedule data={data} today="2026-10-28" todayOnly={false} marketing={false} onOpen={open} onCreate={() => {}} />));
    expect(container.querySelectorAll(".apg-mobile-date-strip button")).toHaveLength(7);
    expect(container.querySelector(".apg-mobile-timeline")?.textContent).toContain("Workshop capture");
    expect(container.querySelector(".apg-mobile-timeline")?.textContent).toContain("Review call");
    expect(container.querySelector(".apg-mobile-timeline")?.textContent).toContain("09:30");
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>(".apg-mobile-timeline button")].find(button => button.textContent?.includes("Review call"))!.click());
    expect(open).toHaveBeenCalledWith(data.calendarEvents[1]);
  });
  it("switches to a fortnight and selects another day without shifting the whole date strip", async () => {
    await act(async () => root.render(<ProductionMobileSchedule data={data} today="2026-10-28" todayOnly={false} marketing onOpen={() => {}} onCreate={() => {}} />));
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Schedule view"] button')].find(button => button.textContent === "Fortnight")!.click());
    expect(container.querySelectorAll(".apg-mobile-date-strip button")).toHaveLength(14);
    const last = container.querySelector(".apg-mobile-date-strip button:last-child") as HTMLButtonElement;
    const label = last.getAttribute("aria-label");
    await act(async () => last.click());
    expect(container.querySelector(".apg-mobile-date-strip button:last-child")?.getAttribute("aria-label")).toBe(label);
    expect(weather).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "melbourne-city");
  });
  it("Today shows an agenda, not a squeezed multi-column timetable", async () => {
    await act(async () => root.render(<ProductionMobileSchedule data={data} today="2026-10-28" todayOnly marketing={false} onOpen={() => {}} onCreate={() => {}} />));
    expect(container.querySelector('[aria-label="Today agenda"]')).not.toBeNull();
    expect(container.querySelector(".apg-mobile-date-strip")).toBeNull();
    expect(container.querySelector(".production-timetable")).toBeNull();
  });
});
