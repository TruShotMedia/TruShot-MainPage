// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarCustomEvent, CalendarFlightEvent, CalendarJob, CalendarTask } from "@/lib/types";
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
  client_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  client_name: "Autopacific Group",
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

const flightEvents: CalendarFlightEvent[] = [{
  id: "44444444-4444-4444-8444-444444444444",
  entity_type: "flight-event",
  client_id: null,
  client_name: null,
  travel_plan_id: null,
  leg_order: 1,
  leg_kind: "outbound",
  title: "Sydney production trip",
  departure_date: "2026-08-12",
  departure_time: "07:30:00",
  arrival_date: "2026-08-13",
  arrival_time: "09:05:00",
  origin_location: "Brisbane · BNE",
  destination_location: "Sydney · SYD",
  departure_airline: "Qantas Airways",
  arrival_airline: "Qantas Airways",
  departure_airline_code: "QF",
  arrival_airline_code: "QF",
  departure_flight_number: "QF 501",
  arrival_flight_number: "QF 501",
  departure_terminal: "Domestic 3",
  arrival_terminal: "Domestic 3",
  travel_class: "Economy",
  seat_number: "14A",
  notes: "Camera gear is carry-on.",
  accommodation_title: "The Old Clare",
  accommodation_location: "Chippendale",
  accommodation_notes: "Late check-in",
  vehicle_title: "Airport transfer",
  vehicle_location: "Terminal 3",
  vehicle_notes: "Driver has the itinerary",
  color: "#3975ad",
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

  it("uses the client accent only for matching work and mutes unrelated calendar items", async () => {
    const autopacificJob: CalendarJob = {
      ...jobs[0],
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Autopacific launch",
      client_name: "Autopacific Group",
    };
    const autopacificTask: CalendarTask = {
      ...tasks[0],
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Autopacific edit",
      client_name: "Autopacific Group",
      is_complete: false,
    };
    const studioEvent: CalendarCustomEvent = {
      ...customEvents[0],
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      client_id: null,
      client_name: null,
      title: "Studio planning",
      start_date: "2026-08-19",
      end_date: "2026-08-19",
    };
    await act(async () => root.render(
      <TabletCalendar
        accentColor="#5d91b0"
        accentClientName="Autopacific Group"
        accentKeywords={["autopacific"]}
        mutedColor="#687177"
        customEvents={[customEvents[0], studioEvent]}
        flightEvents={flightEvents}
        jobs={[autopacificJob, jobs[0]]}
        tasks={[autopacificTask, { ...tasks[0], is_complete: false }]}
        today="2026-08-25"
      />,
    ));

    const autopacificJobRange = container.querySelector<HTMLElement>('[aria-label^="Autopacific launch"]');
    const otherJobRange = container.querySelector<HTMLElement>('[aria-label^="Launch campaign"]');
    const autopacificTaskDeadline = container.querySelector<HTMLElement>('[title^="Asset due: Autopacific edit"]');
    const otherTaskDeadline = container.querySelector<HTMLElement>('[title^="Asset due: Published reel"]');
    const calendarEvents = container.querySelectorAll<HTMLElement>(".tablet-calendar-job-range.is-calendar-event");
    const flight = container.querySelector<HTMLElement>(".tablet-calendar-flight-range");
    expect(autopacificJobRange?.style.getPropertyValue("--tablet-calendar-color")).toBe("#5d91b0");
    expect(otherJobRange?.style.getPropertyValue("--tablet-calendar-color")).toBe("#687177");
    expect(autopacificTaskDeadline?.style.getPropertyValue("--tablet-calendar-color")).toBe("#5d91b0");
    expect(otherTaskDeadline?.style.getPropertyValue("--tablet-calendar-color")).toBe("#687177");
    expect(calendarEvents[0]?.style.getPropertyValue("--tablet-calendar-color")).toBe("#5d91b0");
    expect(calendarEvents[1]?.style.getPropertyValue("--tablet-calendar-color")).toBe("#687177");
    expect(flight?.style.getPropertyValue("--tablet-calendar-color")).toBe("#687177");
  });

  it("marks unfinished overdue AutoPacific jobs red without recolouring unrelated or completed jobs", async () => {
    const overdueJob: CalendarJob = {
      ...jobs[0],
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "Overdue AutoPacific job",
      client_name: "Autopacific Group",
      shoot_date: "2026-08-20",
      due_date: "2026-08-24",
    };
    const unrelatedJob: CalendarJob = {
      ...overdueJob,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      title: "Overdue other-client job",
      client_name: "Ravish Media",
    };
    const completedJob: CalendarJob = {
      ...overdueJob,
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      title: "Completed AutoPacific job",
      is_complete: true,
    };

    await act(async () => root.render(
      <TabletCalendar
        accentColor="#5d91b0"
        accentClientName="Autopacific Group"
        mutedColor="#687177"
        overdueColor="#c5524a"
        jobs={[overdueJob, unrelatedJob, completedJob]}
        tasks={[]}
        today="2026-08-25"
      />,
    ));

    const overdueRange = container.querySelector<HTMLElement>('[aria-label^="Overdue AutoPacific job"]');
    const unrelatedRange = container.querySelector<HTMLElement>('[aria-label^="Overdue other-client job"]');
    const completedRange = container.querySelector<HTMLElement>('[aria-label^="Completed AutoPacific job"]');
    expect(overdueRange?.classList.contains("is-overdue")).toBe(true);
    expect(overdueRange?.style.getPropertyValue("--tablet-calendar-color")).toBe("#c5524a");
    expect(overdueRange?.getAttribute("aria-label")).toContain("overdue");
    expect(unrelatedRange?.classList.contains("is-overdue")).toBe(false);
    expect(unrelatedRange?.style.getPropertyValue("--tablet-calendar-color")).toBe("#687177");
    expect(completedRange?.classList.contains("is-overdue")).toBe(false);
    expect(completedRange?.classList.contains("is-complete")).toBe(true);
    expect(container.querySelector(".tablet-calendar-legend .is-overdue")?.parentElement?.textContent).toContain("Overdue");
  });

  it("marks completed AutoPacific jobs, tasks, events, and flights green", async () => {
    const completedJob: CalendarJob = {
      ...jobs[0],
      client_name: "Autopacific Group",
      is_complete: true,
    };

    await act(async () => root.render(
      <TabletCalendar
        accentColor="#5d91b0"
        accentClientName="Autopacific Group"
        completedColor="#3f9b68"
        currentTime="12:00"
        customEvents={customEvents}
        flightEvents={flightEvents}
        jobs={[completedJob]}
        tasks={tasks}
        today="2026-08-25"
      />,
    ));

    const completedItems = [
      container.querySelector<HTMLElement>('[aria-label^="Launch campaign"]'),
      container.querySelector<HTMLElement>('[title^="Asset due: Published reel"]'),
      container.querySelector<HTMLElement>(".tablet-calendar-job-range.is-calendar-event"),
      container.querySelector<HTMLElement>(".tablet-calendar-flight-range"),
    ];
    expect(completedItems.every((item) => item?.classList.contains("is-complete"))).toBe(true);
    expect(completedItems.every((item) => item?.style.getPropertyValue("--tablet-calendar-color") === "#3f9b68")).toBe(true);
    expect(container.querySelector<HTMLElement>(".tablet-calendar-legend .is-complete")?.style.background).toBe("rgb(63, 155, 104)");
  });

  it("keeps delayed history distinct and marks its scheduled successor", async () => {
    const delayedSource: CalendarJob = {
      ...jobs[0],
      id: "abababab-abab-4bab-8bab-abababababab",
      title: "Weather-delayed shoot",
      is_complete: true,
      delay_info: {
        delayed_from: null,
        delayed_to: {
          id: "delay-one",
          source_id: "abababab-abab-4bab-8bab-abababababab",
          successor_id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
          reason: "Rain moved the shoot.",
          source_date: "2026-08-14",
          rescheduled_date: "2026-08-18",
          created_at: "2026-08-12T00:00:00.000Z",
        },
        history: [],
      },
    };
    const rescheduledJob: CalendarJob = {
      ...delayedSource,
      id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
      title: "Rescheduled shoot",
      shoot_date: "2026-08-18",
      due_date: "2026-08-20",
      is_complete: false,
      delay_info: {
        delayed_from: delayedSource.delay_info!.delayed_to,
        delayed_to: null,
        history: [],
      },
    };

    await act(async () => root.render(<TabletCalendar jobs={[delayedSource, rescheduledJob]} tasks={[]} today="2026-08-25" />));

    const source = container.querySelector<HTMLElement>('[aria-label^="Weather-delayed shoot"]');
    const successor = container.querySelector<HTMLElement>('[aria-label^="Rescheduled shoot"]');
    expect(source?.classList.contains("is-delayed-source")).toBe(true);
    expect(source?.style.getPropertyValue("--tablet-calendar-color")).toBe("#C45A45");
    expect(successor?.classList.contains("is-rescheduled")).toBe(true);
    expect(successor?.style.getPropertyValue("--tablet-calendar-color")).toBe("#B47448");
    expect(successor?.getAttribute("title")).toContain("Rain moved the shoot.");
  });

  it("renders a double-height flight itinerary with route details and editing", async () => {
    const onEditFlight = vi.fn();
    await act(async () => root.render(<TabletCalendar editable jobs={[]} tasks={[]} flightEvents={flightEvents} onEditFlight={onEditFlight} today="2026-08-25" />));

    const flight = container.querySelector<HTMLElement>(".tablet-calendar-flight-range")!;
    expect(flight).not.toBeNull();
    expect(flight.style.gridColumn).toBe("3 / span 2");
    expect(flight.style.gridRow).toBe("1 / span 2");
    expect(flight.textContent).toContain("7:30amBrisbane · BNE");
    expect(flight.querySelectorAll("img[alt='Qantas Airways logo']")).toHaveLength(2);
    expect(flight.title).toContain("Accommodation: The Old Clare · Chippendale · Late check-in");
    expect(flight.title).toContain("Vehicle: Airport transfer · Terminal 3");
    await act(async () => flight.click());
    expect(onEditFlight).toHaveBeenCalledWith(flightEvents[0]);
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

  it("uses a two-week AutoPacific capacity window without hiding busy-day entries", async () => {
    const busyTasks = Array.from({ length: 6 }, (_, index): CalendarTask => ({
      ...tasks[0],
      id: `55555555-5555-4555-8555-55555555555${index}`,
      title: `AutoPacific asset ${index + 1}`,
      due_date: "2026-08-25",
      is_complete: false,
    }));

    await act(async () => root.render(<TabletCalendar density="capacity" jobs={jobs} tasks={busyTasks} today="2026-08-25" />));

    const calendarDays = [...container.querySelectorAll<HTMLTimeElement>(".tablet-calendar-day > time")];
    expect(calendarDays).toHaveLength(14);
    expect(calendarDays[0]?.dateTime).toBe("2026-08-24");
    expect(calendarDays.at(-1)?.dateTime).toBe("2026-09-06");
    expect(container.textContent).toContain("Two-week focus");
    const busyDay = container.querySelector<HTMLTimeElement>('time[datetime="2026-08-25"]')?.parentElement;
    expect(busyDay?.querySelectorAll(".tablet-calendar-event")).toHaveLength(6);
    expect(busyDay?.querySelector(".tablet-calendar-overflow")).toBeNull();
  });

  it("turns the AutoPacific calendar into a readable weekly agenda on phones", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: true,
        media: "(max-width: 760px)",
        onchange: null,
        removeEventListener: vi.fn(),
      })),
    });
    const mobileJob: CalendarJob = {
      ...jobs[0],
      id: "66666666-6666-4666-8666-666666666666",
      title: "Mobile production window",
      client_name: "Autopacific Group",
      shoot_date: "2026-08-24",
      due_date: "2026-08-28",
    };
    const mobileTask: CalendarTask = {
      ...tasks[0],
      id: "77777777-7777-4777-8777-777777777777",
      title: "Mobile deadline",
      client_name: "Autopacific Group",
      due_date: "2026-08-25",
      is_complete: false,
    };

    await act(async () => root.render(<TabletCalendar density="capacity" jobs={[mobileJob]} tasks={[mobileTask]} today="2026-08-25" />));

    expect(container.querySelector('[data-testid="tablet-calendar-mobile"]')).not.toBeNull();
    expect(container.querySelectorAll('.tablet-calendar-mobile-week button')).toHaveLength(7);
    expect(container.textContent).toContain("One-week focus");
    expect(container.textContent).toContain("Mobile production window");
    expect(container.textContent).toContain("Mobile deadline");

    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
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
