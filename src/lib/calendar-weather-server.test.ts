import { afterEach, describe, expect, it, vi } from "vitest";
import { captureCalendarWeather } from "./calendar-weather-server";

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn(), upsert: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: mocks.from }) }));

function database(existing: unknown = null) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.maybeSingle, upsert: mocks.upsert, update: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis() };
  mocks.from.mockReturnValue(query);
  mocks.maybeSingle.mockResolvedValue({ data: existing, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  return query;
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("weekly weather capture", () => {
  it("does not fetch or rewrite an already saved forecast", async () => {
    const query = database({ lookahead: { days: [{ date: "2026-11-02" }] } });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(captureCalendarWeather(new Date("2026-10-26T00:00:00Z"))).resolves.toMatchObject({ status: "already-saved", location: "brisbane-city" });
    expect(fetch).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("adds only the missing lookahead without replacing the original saved week", async () => {
    const query = database({ lookahead: null });
    mocks.maybeSingle.mockResolvedValueOnce({ data: { lookahead: null }, error: null }).mockResolvedValueOnce({ data: { week_start: "2026-10-26" }, error: null });
    const timeseries = ["2026-10-28", "2026-11-02", "2026-11-03"].map(date => ({ time: `${date}T02:00:00Z`, data: {
      instant: { details: { air_temperature: 25, wind_speed: 2 } }, next_6_hours: { summary: { symbol_code: "clearsky_day" } },
    } }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ properties: { meta: { updated_at: "2026-10-28T00:00:00Z" }, timeseries } })));
    await expect(captureCalendarWeather(new Date("2026-10-28T00:00:00Z"))).resolves.toMatchObject({ status: "extended", extraDays: 2 });
    expect(query.update).toHaveBeenCalledWith({ lookahead: { captured_at: "2026-10-28T00:00:00.000Z", forecast_issued_at: "2026-10-28T00:00:00Z", days: [expect.objectContaining({ date: "2026-11-02" }), expect.objectContaining({ date: "2026-11-03" })] } });
    expect(query.is).toHaveBeenCalledWith("lookahead", null);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("fails closed on provider failure without modifying saved data", async () => {
    database();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    await expect(captureCalendarWeather()).rejects.toThrow("503");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["brisbane-city", -27.4698, 153.0251],
    ["melbourne-city", -37.8136, 144.9631],
  ] as const)("inserts %s with first-write-wins protection and city-specific coordinates", async (locationKey, latitude, longitude) => {
    const query = database();
    const data = { properties: { meta: { updated_at: "2026-10-26T00:00:00Z" }, timeseries: [{ time: "2026-10-26T02:00:00Z", data: { instant: { details: { air_temperature: 25, wind_speed: 2 } }, next_6_hours: { summary: { symbol_code: "clearsky_day" } } } }] } };
    const fetch = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal("fetch", fetch);
    await expect(captureCalendarWeather(new Date("2026-10-26T00:00:00Z"), locationKey)).resolves.toMatchObject({ status: "saved", location: locationKey, days: 1 });
    expect(query.eq).toHaveBeenCalledWith("location_key", locationKey);
    expect(fetch.mock.calls[0][0].toString()).toContain(`lat=${latitude}&lon=${longitude}`);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ location_key: locationKey, latitude, longitude, capture_kind: "initial" }), { onConflict: "workspace_id,location_key,week_start", ignoreDuplicates: true });
  });
});
