// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MobileFortnightCalendar } from "./mobile-fortnight-calendar";
import { CalendarTeamColorsProvider } from "@/components/shared/calendar-team-colors";
import { assignTeamCalendarColors } from "@/lib/team-calendar-colors";
import type { CalendarJob, CalendarTask } from "@/lib/types";
vi.mock("@/components/shared/calendar-weather", () => ({ WeatherIcon: () => <svg data-weather-icon /> }));

it("keeps Team colours on shared bars and completed deadlines while day targets select the complete schedule", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", vi.fn());
  const members = assignTeamCalendarColors([
    { user_id: "john", display_name: "John", username: "john", role: "manager", is_active: true, avatar_color: "#579" },
    { user_id: "nathan", display_name: "Nathan", username: "nathan", role: "marketing", is_active: true, avatar_color: "#579" },
  ]);
  const job: CalendarJob = { id: "shared", title: "Shared shoot", entity_type: "job", client_name: "Autopacific Group", shoot_date: "2026-11-23", shoot_time: "09:00", due_date: "2026-11-27", due_time: null, status_label: "Scheduled", status_color: "#579", is_complete: false, assignee_ids: ["john", "nathan"] };
  const task: CalendarTask = { id: "complete", title: "Finished asset", entity_type: "task", client_name: job.client_name, job_title: job.title, due_date: "2026-11-24", due_time: null, priority: "normal", status_label: "Complete", status_color: "#397253", is_complete: true, assignee_ids: ["nathan"] };
  const selected = vi.fn(); const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<CalendarTeamColorsProvider value={members}><MobileFortnightCalendar data={{ calendarJobs: [job], calendarTasks: [task], calendarEvents: [], flightEvents: [] }} anchor="2026-11-23" selected="2026-11-23" today="2026-11-23" weather={[]} onSelectDate={selected} /></CalendarTeamColorsProvider>));
    expect(container.querySelectorAll(".apg-fortnight-day")).toHaveLength(14);
    expect(container.querySelector('.apg-fortnight-range .calendar-team-marker')?.getAttribute("aria-label")).toBe("Assigned to John, Nathan");
    expect(container.querySelectorAll(".apg-fortnight-range .calendar-team-marker i")).toHaveLength(2);
    expect(container.querySelector(".apg-fortnight-entry.is-complete")?.getAttribute("data-team-calendar")).toBe("true");
    expect(container.querySelector('button button')).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-date="2026-11-24"]')!.click());
    expect(selected).toHaveBeenCalledWith("2026-11-24");
    expect(fetch).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
