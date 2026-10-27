import { describe, expect, it } from "vitest";
import { flattenWeatherSnapshots, weatherCaptureWindow, weatherCondition, weatherDate } from "./calendar-weather";
import { buildWeatherSnapshot } from "./calendar-weather-forecast";

function forecast(start = "2026-10-25T00:00:00Z", count = 36) {
  return { properties: { meta: { updated_at: "2026-10-24T18:00:00Z" }, timeseries: Array.from({ length: count }, (_, index) => ({ time: new Date(new Date(start).getTime() + index * 6 * 3_600_000).toISOString(), data: { instant: { details: { air_temperature: 20 + index % 4, wind_speed: 5 } }, next_6_hours: { summary: { symbol_code: "partlycloudy_day" } } } })) } };
}

describe("Brisbane saved calendar weather", () => {
  it("captures next Monday–Sunday on Brisbane Sunday, not UTC Sunday", () => {
    const now = new Date("2026-10-24T20:17:00Z");
    expect(weatherDate(now)).toBe("2026-10-25");
    expect(weatherCaptureWindow(now)).toEqual({ weekStart: "2026-10-26", end: "2026-11-01", today: "2026-10-25", kind: "weekly" });
    const snapshot = buildWeatherSnapshot(forecast(), now);
    expect(snapshot.days.map((day) => day.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(snapshot.days[0]).toMatchObject({ condition: "partly-cloudy", temperatureMin: 20, temperatureMax: 23, windMaxKmh: 18 });
  });

  it("bootstraps only remaining days and never backfills invented historic forecasts", () => {
    const now = new Date("2026-10-28T00:00:00Z");
    const snapshot = buildWeatherSnapshot(forecast("2026-10-28T00:00:00Z"), now);
    expect(snapshot.capture_kind).toBe("initial");
    expect(snapshot.week_start).toBe("2026-10-26");
    expect(snapshot.days.map((day) => day.date)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("rejects partial Sunday weeks and invalid provider data instead of saving misleading icons", () => {
    expect(() => buildWeatherSnapshot(forecast(undefined, 8), new Date("2026-10-24T20:17:00Z"))).toThrow("complete coming week");
    expect(() => buildWeatherSnapshot({}, new Date())).toThrow();
  });

  it("normalises the provider's weather symbols and preserves provenance", () => {
    expect(weatherCondition("heavyrainshowersandthunder_day").condition).toBe("storm");
    expect(weatherCondition("fog").condition).toBe("fog");
    expect(weatherCondition("clearsky_day").condition).toBe("sun");
    expect(weatherCondition("snowshowers_night").condition).toBe("snow");
    const snapshot = buildWeatherSnapshot(forecast(), new Date("2026-10-24T20:17:00Z"));
    expect(flattenWeatherSnapshots([snapshot])[0]).toMatchObject({ captured_at: snapshot.captured_at, forecast_issued_at: snapshot.forecast_issued_at, week_start: "2026-10-26", capture_kind: "weekly" });
  });
});
