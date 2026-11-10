import { format, parseISO } from "date-fns";
import { productionDayAgenda, layoutTimedBlocks } from "./production-agenda";
import { getCalendarScheduleRanges } from "./calendar-layout";
import { buildFlightCalendarItineraries } from "./flight-itineraries";
import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarFlightEvent, CalendarJob, CalendarTask } from "./types";

export type ProductionScheduleData = {
  calendarJobs: CalendarJob[]; calendarTasks: CalendarTask[];
  calendarEvents: CalendarCustomEvent[]; flightEvents: CalendarFlightEvent[];
  calendarCampaignAssets?: CalendarCampaignAsset[];
};

/** One local projection for the phone agenda and Hybrid pane. No extra reads. */
export function productionSelectedDay(date: string, data: ProductionScheduleData) {
  const agenda = productionDayAgenda(date, { jobs: data.calendarJobs, tasks: data.calendarTasks, events: data.calendarEvents, flights: data.flightEvents });
  const assets = data.calendarCampaignAssets ?? [];
  for (const asset of assets) {
    if (asset.start_date === date) {
      if (asset.start_time) {
        const [hour, minute] = asset.start_time.split(":").map(Number);
        const start = hour * 60 + minute;
        agenda.timed.push({ id: `campaign-start:${asset.id}`, title: asset.title, start, end: Math.min(1440, start + 30), time: asset.start_time.slice(0, 5), detail: `Campaign · ${asset.campaign_title}`, source: asset, lane: 0, lanes: 1 });
      } else agenda.allDay.push({ id: `campaign-start:${asset.id}`, title: asset.title, detail: `Campaign · ${asset.campaign_title}`, source: asset });
    }
    if (asset.due_date === date) agenda.allDay.push({ id: `campaign-due:${asset.id}`, title: asset.title, detail: `Campaign deadline${asset.due_time ? ` · ${asset.due_time.slice(0, 5)}` : ""}`, source: asset });
  }
  const weekday = parseISO(date).getDay();
  for (const range of getCalendarScheduleRanges([...data.calendarJobs, ...assets])) {
    if (range.start < date && range.end > date && (!range.weekdaysOnly || weekday > 0 && weekday < 6)) {
      agenda.allDay.push({ id: `ongoing:${range.id}`, title: range.item.title, detail: `Production window · Due ${format(parseISO(range.end), "d MMM")}`, source: range.item });
    }
  }
  for (const trip of buildFlightCalendarItineraries(data.flightEvents)) {
    if (trip.departure_date < date && trip.arrival_date > date) agenda.allDay.push({ id: `trip:${trip.id}`, title: trip.title, detail: `Trip in progress · Returns ${format(parseISO(trip.arrival_date), "d MMM")}`, source: trip });
  }
  return { allDay: agenda.allDay, timed: layoutTimedBlocks(agenda.timed) };
}
