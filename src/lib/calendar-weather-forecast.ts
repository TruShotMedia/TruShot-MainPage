import { z } from "zod";
import { weatherCaptureWindow, weatherCondition, weatherDate, WEATHER_LOCATION, WEATHER_LOCATIONS, type WeatherLocationKey, type CalendarWeatherDay, type CalendarWeatherSnapshot } from "@/lib/calendar-weather";

const hourFormatters = Object.fromEntries(Object.values(WEATHER_LOCATIONS).map(location => [location.key, new Intl.DateTimeFormat("en-GB", { timeZone: location.timezone, hour: "2-digit", hourCycle: "h23" })])) as Record<WeatherLocationKey, Intl.DateTimeFormat>;

const periodSchema = z.object({ summary: z.object({ symbol_code: z.string() }) });
const forecastSchema = z.object({
  properties: z.object({
    meta: z.object({ updated_at: z.iso.datetime() }),
    timeseries: z.array(z.object({
      time: z.iso.datetime(),
      data: z.object({
        instant: z.object({ details: z.object({ air_temperature: z.number().finite(), wind_speed: z.number().nonnegative().finite() }) }),
        next_1_hours: periodSchema.optional(),
        next_6_hours: periodSchema.optional(),
        next_12_hours: periodSchema.optional(),
      }),
    })).min(1),
  }),
});

/** Daytime symbol, weighted by interval length; temperature range is sampled, not observed. */
export function buildWeatherSnapshot(payload: unknown, now: Date, locationKey: WeatherLocationKey = WEATHER_LOCATION.key): CalendarWeatherSnapshot {
  const forecast = forecastSchema.parse(payload);
  const window = weatherCaptureWindow(now, locationKey);
  const days = new Map<string, { temperatures: number[]; winds: number[]; symbols: Map<string, number> }>();
  const points = forecast.properties.timeseries;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const time = new Date(point.time);
    const date = weatherDate(time, locationKey);
    // Never invent a retrospective forecast for a day before the first capture.
    if (date < window.weekStart || date > window.end || date < window.today) continue;
    const day = days.get(date) ?? { temperatures: [], winds: [], symbols: new Map<string, number>() };
    day.temperatures.push(point.data.instant.details.air_temperature);
    day.winds.push(point.data.instant.details.wind_speed * 3.6);
    const hour = Number(hourFormatters[locationKey].format(time));
    const period = point.data.next_1_hours ?? point.data.next_6_hours ?? point.data.next_12_hours;
    if (period && hour >= 6 && hour < 18) {
      const symbol = period.summary.symbol_code.replace(/_(day|night|polartwilight)$/, "");
      const next = points[index + 1];
      const hours = next ? Math.min(6, Math.max(1, (new Date(next.time).getTime() - time.getTime()) / 3_600_000)) : 1;
      day.symbols.set(symbol, (day.symbols.get(symbol) ?? 0) + hours);
    }
    days.set(date, day);
  }
  const result: CalendarWeatherDay[] = [];
  for (const [date, day] of days) {
    // A partial final day with no daytime prediction must not masquerade as a complete forecast.
    if (!day.symbols.size) continue;
    const dominant = [...day.symbols].sort((left, right) => right[1] - left[1])[0][0];
    result.push({ date, ...weatherCondition(dominant), temperatureMin: Math.round(Math.min(...day.temperatures)), temperatureMax: Math.round(Math.max(...day.temperatures)), windMaxKmh: Math.round(Math.max(...day.winds)) });
  }
  if (!result.length) throw new Error(`The weather provider returned no usable ${WEATHER_LOCATIONS[locationKey].label} forecast days.`);
  if (window.kind === "weekly" && result.length !== 7) throw new Error("The provider did not return the complete coming week; the Sunday snapshot was not saved.");
  return { location_key: locationKey, week_start: window.weekStart, captured_at: now.toISOString(), forecast_issued_at: forecast.properties.meta.updated_at, capture_kind: window.kind, days: result.sort((left, right) => left.date.localeCompare(right.date)) };
}
