"use client";

import { useId, useMemo, type CSSProperties } from "react";
import { format, parseISO } from "date-fns";
import { Plane } from "lucide-react";
import { WeatherIcon } from "@/components/shared/calendar-weather";
import { OutlookEventMark } from "@/components/shared/outlook-event-mark";
import { isOutlookEvent } from "@/lib/outlook-calendar/model";
import { CalendarTeamMarker, useCalendarTeamColors } from "@/components/shared/calendar-team-colors";
import { CalendarDropDay } from "@/components/shared/calendar-event-drag";
import { calendarTeamAttributes } from "@/lib/team-calendar-colors";
import { buildMobileCalendarGrid, mobileRangeTime, mobileScheduleTone } from "@/lib/mobile-fortnight-calendar";
import type { SavedCalendarWeather } from "@/lib/calendar-weather";
import type { ProductionScheduleData } from "@/lib/production-selected-day";
import "./mobile-fortnight-calendar.css";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function MobileFortnightCalendar({ data, anchor, selected, today, weather, onSelectDate, mode = "fortnight" }: {
  data: ProductionScheduleData; anchor: string; selected: string; today: string;
  weather: readonly SavedCalendarWeather[]; onSelectDate: (date: string) => void;
  mode?: "fortnight" | "month";
}) {
  const descriptionId = useId();
  const weeks = useMemo(() => buildMobileCalendarGrid(anchor, data, mode), [anchor, data, mode]);
  const forecasts = useMemo(() => new Map(weather.map(day => [day.date, day])), [weather]);
  const members = useCalendarTeamColors();
  return <section className={`apg-mobile-fortnight ${mode === "month" ? "is-month-grid" : ""}`} aria-label={mode === "month" ? "Month calendar" : "Fortnight calendar"}>
    <div className="apg-fortnight-weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
    {weeks.map(week => <div className="apg-fortnight-week" role="group" aria-label={`Week of ${format(parseISO(week.dayKeys[0]), "d MMMM")}`} style={{ "--fortnight-range-rows": week.visibleLanes } as CSSProperties} key={week.dayKeys[0]}>
      <div className="apg-fortnight-days">
        {week.days.map(day => {
          const forecast = forecasts.get(day.date);
          return <CalendarDropDay as="button" date={day.date} type="button" key={day.date} data-date={day.date}
            className={`apg-fortnight-day ${day.date === today ? "is-today" : ""} ${mode === "month" && day.date.slice(0, 7) !== anchor.slice(0, 7) ? "is-outside-month" : ""}`}
            aria-label={format(parseISO(day.date), "EEEE d MMMM")}
            aria-describedby={`${descriptionId}-${day.date}`}
            aria-pressed={selected === day.date}
            aria-current={day.date === today ? "date" : undefined}
            title={day.summary || "No scheduled items"} onClick={() => onSelectDate(day.date)}>
            <span id={`${descriptionId}-${day.date}`} className="apg-fortnight-day-description">{day.count} calendar {day.count === 1 ? "item" : "items"}. Select to see the full day’s schedule below.{forecast ? ` Saved forecast: ${forecast.summary}.` : ""}</span>
            <span className="apg-fortnight-date"><time dateTime={day.date}>{format(parseISO(day.date), "d")}</time>{forecast ? <span className="apg-fortnight-weather" title={forecast.summary}><WeatherIcon condition={forecast.condition} size={11} /></span> : null}</span>
            <span className="apg-fortnight-entries" aria-hidden="true">
              {day.entries.map(entry => <span key={entry.id} className={`apg-fortnight-entry ${mobileScheduleTone(entry.source, today)}`} {...calendarTeamAttributes(entry.source, members)}>
                <span className="apg-fortnight-entry-time">{entry.time || entry.label}</span><strong>{entry.title}</strong><CalendarTeamMarker record={entry.source} />
              </span>)}
              {day.hiddenCount ? <span className="apg-fortnight-more">+{day.hiddenCount} more</span> : null}
              {!day.count ? <span className="apg-fortnight-free">—</span> : null}
            </span>
          </CalendarDropDay>;
        })}
      </div>
      <div className="apg-fortnight-ranges" aria-hidden="true">
        {week.visibleSegments.map(segment => {
          const source = segment.item;
          const time = mobileRangeTime(segment, week.dayKeys[segment.startColumn]);
          return <div key={`${segment.id}:${segment.startColumn}`} className={`apg-fortnight-range ${mobileScheduleTone(source, today)} ${segment.startsBeforeWeek ? "continues-before" : ""} ${segment.endsAfterWeek ? "continues-after" : ""}`}
            {...calendarTeamAttributes(source, members)}
            data-calendar-source={isOutlookEvent(source) ? "outlook" : undefined}
            style={{ ...calendarTeamAttributes(source, members).style,
              gridColumn: `${segment.startColumn + 1} / span ${segment.span}`, gridRow: segment.lane + 1 } as CSSProperties}>
            <span className="apg-fortnight-range-time">{source.entity_type === "flight-event" ? <Plane size={9} /> : null}{time || (segment.start < week.dayKeys[segment.startColumn] ? "Continues" : "All day")}</span>
            <strong>{source.title}</strong><CalendarTeamMarker record={source} />{isOutlookEvent(source) ? <OutlookEventMark inline /> : null}
          </div>;
        })}
      </div>
    </div>)}
    <p className="apg-fortnight-help">Tap a day for its full schedule.{members.length ? " Shared work keeps each person’s colour." : ""}</p>
  </section>;
}
