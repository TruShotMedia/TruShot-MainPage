import { addDays, format, parseISO, startOfWeek } from "date-fns";

export const WEATHER_LOCATIONS = {
  "brisbane-city": { key: "brisbane-city", name: "Brisbane City", label: "Brisbane", latitude: -27.4698, longitude: 153.0251, timezone: "Australia/Brisbane" },
  "melbourne-city": { key: "melbourne-city", name: "Melbourne", label: "Melbourne", latitude: -37.8136, longitude: 144.9631, timezone: "Australia/Melbourne" },
} as const;
export type WeatherLocationKey = keyof typeof WEATHER_LOCATIONS;
export const WEATHER_LOCATION = WEATHER_LOCATIONS["brisbane-city"];

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
  location_key?: WeatherLocationKey;
  week_start: string;
  captured_at: string;
  forecast_issued_at: string;
  capture_kind: "weekly" | "initial";
  days: CalendarWeatherDay[];
};
export type SavedCalendarWeather = CalendarWeatherDay & Pick<CalendarWeatherSnapshot, "captured_at" | "forecast_issued_at" | "capture_kind" | "week_start"> & { location_key: WeatherLocationKey };

const dateFormatters = Object.fromEntries(Object.values(WEATHER_LOCATIONS).map(location => [location.key, new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone, year: "numeric", month: "2-digit", day: "2-digit" })])) as Record<WeatherLocationKey, Intl.DateTimeFormat>;

export function weatherDate(now: Date, locationKey: WeatherLocationKey = WEATHER_LOCATION.key) {
  const parts = dateFormatters[locationKey].formatToParts(now);
  return ["year", "month", "day"].map((kind) => parts.find((part) => part.type === kind)?.value).join("-");
}

/** Sunday captures the following Monday–Sunday. Other days bootstrap this week. */
export function weatherCaptureWindow(now: Date, locationKey: WeatherLocationKey = WEATHER_LOCATION.key) {
  const today = weatherDate(now, locationKey);
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


export function flattenWeatherSnapshots(snapshots: CalendarWeatherSnapshot[], locationKey: WeatherLocationKey = WEATHER_LOCATION.key) {
  return snapshots.filter(snapshot => (snapshot.location_key ?? WEATHER_LOCATION.key) === locationKey).flatMap((snapshot) => snapshot.days.map((day): SavedCalendarWeather => ({ ...day, location_key: locationKey, week_start: snapshot.week_start, captured_at: snapshot.captured_at, forecast_issued_at: snapshot.forecast_issued_at, capture_kind: snapshot.capture_kind })));
}
