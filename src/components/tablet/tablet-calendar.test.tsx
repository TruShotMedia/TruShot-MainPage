// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarCustomEvent, CalendarJob, CalendarTask } from "@/lib/types";
import { TabletCalendar } from "./tablet-calendar";

const jobs: CalendarJob[] = [{
  id: "11111111-1111-4111-8111-111111111111",
  entity_type: "job",
  title: "Launch campaign",
  client_name: "Ravish Media",
  shoot_date: "2026-08-14",
  shoot_time: null,
  due_date: "2026-08-16",
  due_time: null,
  status_label: "In progress",
  status_color: "#4778ad",
  is_complete: false,
}];

const tasks: CalendarTask[] = [{
  id: "22222222-2222-4222-8222-222222222222",
  entity_type: "task",
  title: "Published reel",
  job_title: "Launch campaign",
  client_name: "Ravish Media",
  due_date: "2026-08-18",
  due_time: null,
  priority: "normal",
  status_label: "Posted / Done",
  status_color: "#777773",
  is_complete: true,
}];

const customEvents: CalendarCustomEvent[] = [{
  id: "33333333-3333-4333-8333-333333333333",
  entity_type: "calendar-event",
  title: "First day AUTOPACIFIC",
  description: null,
  location: "Geebung",
  start_date: "2026-08-12",
  start_time: null,
  end_date: "2026-08-12",
  end_time: null,
  is_all_day: true,
  color: "#b74f44",
  reminder_offsets_minutes: [0],
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
}];

describe("TabletCalendar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("draws inclusive multi-day job bars and greys completed deadlines", async () => {
    await act(async () => root.render(<TabletCalendar jobs={jobs} tasks={tasks} today="2026-08-25" />));

    expect(container.querySelector("h1")?.textContent).toBe("August 2026");
    const calendarDays = [...container.querySelectorAll<HTMLTimeElement>(".tablet-calendar-day > time")];
    expect(calendarDays).toHaveLength(42);
    expect(calendarDays[0]?.dateTime).toBe("2026-08-03");
    expect(calendarDays.at(-1)?.dateTime).toBe("2026-09-13");
    expect(container.textContent).toContain("Rolling · through 13 Sep");
    const range = container.querySelector<HTMLElement>('[aria-label*="scheduled 14–16 Aug"]');
    expect(range).not.toBeNull();
    expect(range?.getAttribute("aria-label")).toContain("3 days");
    expect(range?.style.gridColumn).toBe("5 / span 3");

    const completedDeadline = container.querySelector<HTMLElement>('[title^="Asset due: Published reel"]');
    expect(completedDeadline).not.toBeNull();
    expect(completedDeadline?.classList.contains("is-complete")).toBe(true);
  });

  it("leaves weekends clear for multi-week Autopacific work", async () => {
    const autopacificJob: CalendarJob = {
      ...jobs[0],
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Weekday production",
      client_name: "Autopacific Group",
      shoot_date: "2026-10-06",
      due_date: "2026-10-14",
    };

    await act(async () => root.render(<TabletCalendar jobs={[autopacificJob]} tasks={[]} today="2026-10-15" />));

    const weekdaySegments = [...container.querySelectorAll<HTMLElement>('[aria-label^="Weekday production"]')];
    expect(weekdaySegments).toHaveLength(2);
    expect(weekdaySegments.map((segment) => segment.style.gridColumn)).toEqual(["2 / span 4", "1 / span 3"]);
    expect(weekdaySegments.every((segment) => segment.getAttribute("aria-label")?.includes("7 days"))).toBe(true);
  });

  it("shows custom event cards with only their title", async () => {
    await act(async () => root.render(<TabletCalendar jobs={[]} tasks={[]} customEvents={customEvents} today="2026-08-25" />));

    const calendarEvent = container.querySelector<HTMLElement>(".tablet-calendar-job-range.is-calendar-event");
    expect(calendarEvent).not.toBeNull();
    expect(calendarEvent?.textContent).toBe("First day AUTOPACIFIC");
    expect(calendarEvent?.title).toContain("Geebung");
  });

  it("summarises busy days instead of overflowing their calendar cell", async () => {
    const busyTasks = Array.from({ length: 6 }, (_, index): CalendarTask => ({
      ...tasks[0],
      id: `22222222-2222-4222-8222-22222222222${index}`,
      title: `Asset ${index + 1}`,
      due_date: "2026-08-14",
      is_complete: false,
    }));

    await act(async () => root.render(<TabletCalendar jobs={jobs} tasks={busyTasks} today="2026-08-25" />));

    const busyDay = container.querySelector<HTMLTimeElement>('time[datetime="2026-08-14"]')?.parentElement;
    expect(busyDay?.querySelectorAll(".tablet-calendar-event")).toHaveLength(2);
    expect(busyDay?.querySelector(".tablet-calendar-overflow")?.textContent).toBe("+4 more");
    expect(busyDay?.querySelector(".tablet-calendar-overflow")?.getAttribute("title")).toContain("Asset 6");
  });

  it("only exposes date and item editing controls when edit mode is enabled", async () => {
    const onCreateEvent = vi.fn();
    const onEditEvent = vi.fn();
    await act(async () => root.render(<TabletCalendar jobs={[]} tasks={[]} customEvents={customEvents} today="2026-08-25" onCreateEvent={onCreateEvent} onEditEvent={onEditEvent} />));

    expect(container.querySelector(".tablet-calendar-day-add")).toBeNull();
    expect(container.querySelector(".tablet-calendar-job-range")?.getAttribute("role")).toBeNull();

    await act(async () => root.render(<TabletCalendar editable jobs={[]} tasks={[]} customEvents={customEvents} today="2026-08-25" onCreateEvent={onCreateEvent} onEditEvent={onEditEvent} />));
    const addButton = container.querySelector<HTMLButtonElement>('button[aria-label="Add event on 12 August 2026"]')!;
    expect(addButton).not.toBeNull();
    await act(async () => addButton.click());
    expect(onCreateEvent).toHaveBeenCalledWith("2026-08-12");

    const eventCard = container.querySelector<HTMLElement>(".tablet-calendar-job-range.is-calendar-event")!;
    expect(eventCard.getAttribute("role")).toBe("button");
    await act(async () => eventCard.click());
    expect(onEditEvent).toHaveBeenCalledWith(customEvents[0]);
  });
});
