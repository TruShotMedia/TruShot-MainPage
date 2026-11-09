import { expect, it } from "vitest";
import { scopeCalendarForWorkspace } from "./marketing-calendar-scope";
import type { CalendarCustomEvent } from "./types";
it("never projects private Outlook events into the Marketing calendar", () => {
  const event = { id: "private", external_source: "outlook", title: "Work meeting", client_name: null } as CalendarCustomEvent;
  const data = { calendarJobs: [], calendarTasks: [], calendarCampaignAssets: [], calendarEvents: [event], flightEvents: [] };
  expect(scopeCalendarForWorkspace(data, "marketing").calendarEvents).toEqual([]);
  expect(scopeCalendarForWorkspace(data, "production").calendarEvents).toEqual([event]);
});
