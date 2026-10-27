import { addDays, format, parseISO, startOfWeek } from "date-fns";

export const WEATHER_LOCATION = { key: "brisbane-city", name: "Brisbane City", latitude: -27.4698, longitude: 153.0251, timezone: "Australia/Brisbane" } as const;

export type WeatherCondition = "sun" | "partly-cloudy" | "cloud" | "fog" | "drizzle" | "rain" | "storm" | "snow";
export type CalendarWeatherDay = {
  date: string;
  condition: WeatherCondition;
  summary: string;
  temperatureMin: number;
  temperatureMax: number;
  windMaxKmh: number;
};
export type CalendarWeatherSnapshot = {
  week_start: string;
  captured_at: string;
  forecast_issued_at: string;
  capture_kind: "weekly" | "initial";
  days: CalendarWeatherDay[];
};
export type SavedCalendarWeather = CalendarWeatherDay & Pick<CalendarWeatherSnapshot, "captured_at" | "forecast_issued_at" | "capture_kind" | "week_start">;

const brisbaneDate = new Intl.DateTimeFormat("en-CA", { timeZone: WEATHER_LOCATION.timezone, year: "numeric", month: "2-digit", day: "2-digit" });

export function weatherDate(now: Date) {
  const parts = brisbaneDate.formatToParts(now);
  return ["year", "month", "day"].map((kind) => parts.find((part) => part.type === kind)?.value).join("-");
}

/** Sunday captures the following Monday–Sunday. Other days bootstrap this week. */
export function weatherCaptureWindow(now: Date) {
  const today = weatherDate(now);
  const date = parseISO(today);
  const sunday = date.getDay() === 0;
  const start = sunday ? addDays(date, 1) : startOfWeek(date, { weekStartsOn: 1 });
  return { weekStart: format(start, "yyyy-MM-dd"), end: format(addDays(start, 6), "yyyy-MM-dd"), today, kind: sunday ? "weekly" as const : "initial" as const };
}

export function weatherCondition(symbol: string): { condition: WeatherCondition; summary: string } {
  if (symbol.includes("thunder")) return { condition: "storm", summary: "Thunderstorms" };
  if (/snow|sleet/.test(symbol)) return { condition: "snow", summary: "Snow or sleet" };
  if (/heavyrain|rain/.test(symbol)) return { condition: "rain", summary: symbol.includes("showers") ? "Rain showers" : "Rain" };
  if (/drizzle/.test(symbol)) return { condition: "drizzle", summary: "Light rain" };
  if (symbol.includes("fog")) return { condition: "fog", summary: "Fog" };
  if (/partlycloudy|fair/.test(symbol)) return { condition: "partly-cloudy", summary: "Partly cloudy" };
  if (symbol.includes("cloudy")) return { condition: "cloud", summary: "Cloudy" };
  return { condition: "sun", summary: "Clear skies" };
}


export function flattenWeatherSnapshots(snapshots: CalendarWeatherSnapshot[]) {
  return snapshots.flatMap((snapshot) => snapshot.days.map((day): SavedCalendarWeather => ({ ...day, week_start: snapshot.week_start, captured_at: snapshot.captured_at, forecast_issued_at: snapshot.forecast_issued_at, capture_kind: snapshot.capture_kind })));
}
