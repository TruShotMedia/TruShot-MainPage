import "server-only";

import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { WEATHER_LOCATION, WEATHER_LOCATIONS, weatherCaptureWindow, type WeatherLocationKey } from "@/lib/calendar-weather";
import { buildWeatherSnapshot } from "@/lib/calendar-weather-forecast";
import { createServiceClient } from "@/lib/supabase/service";

export async function captureCalendarWeather(now = new Date(), locationKey: WeatherLocationKey = WEATHER_LOCATION.key) {
  const location = WEATHER_LOCATIONS[locationKey];
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Weather capture requires the server database connection.");
  const window = weatherCaptureWindow(now, locationKey);
  const { data: existing, error } = await supabase.from("website-weather-snapshots").select("lookahead").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("location_key", location.key).eq("week_start", window.weekStart).maybeSingle();
  if (error) throw error;
  const capture = { location: location.key, weekStart: window.weekStart };
  if (existing?.lookahead) return { status: "already-saved", ...capture };

  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", String(location.latitude));
  url.searchParams.set("lon", String(location.longitude));
  const response = await fetch(url, {
    headers: { "User-Agent": "TruShotCalendar/1.0 https://www.trushotmedia.com", Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Weather forecast request failed (${response.status}).`);
  const snapshot = buildWeatherSnapshot(await response.json(), now, locationKey);
  if (existing) {
    if (!snapshot.lookahead) return { status: "already-saved", ...capture, extraDays: 0 };
    // Backfill just the optional forecast; retries cannot replace a saved capture.
    const { data, error: updateError } = await supabase.from("website-weather-snapshots").update({ lookahead: snapshot.lookahead })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("location_key", location.key).eq("week_start", window.weekStart)
      .is("lookahead", null).select("week_start").maybeSingle();
    if (updateError) throw updateError;
    return data ? { status: "extended", ...capture, extraDays: snapshot.lookahead.days.length } : { status: "already-saved", ...capture };
  }
  // First successful capture wins. Cron retries and concurrent calls can never rewrite history.
  const { error: saveError } = await supabase.from("website-weather-snapshots").upsert({ ...snapshot, workspace_id: TRUSHOT_WORKSPACE_ID, location_key: location.key, provider: "met-norway", latitude: location.latitude, longitude: location.longitude }, { onConflict: "workspace_id,location_key,week_start", ignoreDuplicates: true });
  if (saveError) throw saveError;
  return { status: "saved", ...capture, days: snapshot.days.length, extraDays: snapshot.lookahead?.days.length ?? 0 };
}
