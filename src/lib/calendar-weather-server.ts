import "server-only";

import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { WEATHER_LOCATION, weatherCaptureWindow } from "@/lib/calendar-weather";
import { buildWeatherSnapshot } from "@/lib/calendar-weather-forecast";
import { createServiceClient } from "@/lib/supabase/service";

export async function captureBrisbaneWeather(now = new Date()) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Weather capture requires the server database connection.");
  const window = weatherCaptureWindow(now);
  const { data: existing, error } = await supabase.from("website-weather-snapshots").select("week_start").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("location_key", WEATHER_LOCATION.key).eq("week_start", window.weekStart).maybeSingle();
  if (error) throw error;
  if (existing) return { status: "already-saved", weekStart: window.weekStart };

  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", String(WEATHER_LOCATION.latitude));
  url.searchParams.set("lon", String(WEATHER_LOCATION.longitude));
  const response = await fetch(url, {
    headers: { "User-Agent": "TruShotCalendar/1.0 https://www.trushotmedia.com", Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Weather forecast request failed (${response.status}).`);
  const snapshot = buildWeatherSnapshot(await response.json(), now);
  // First successful capture wins. Cron retries and concurrent calls can never rewrite history.
  const { error: saveError } = await supabase.from("website-weather-snapshots").upsert({ ...snapshot, workspace_id: TRUSHOT_WORKSPACE_ID, location_key: WEATHER_LOCATION.key, provider: "met-norway", latitude: WEATHER_LOCATION.latitude, longitude: WEATHER_LOCATION.longitude }, { onConflict: "workspace_id,location_key,week_start", ignoreDuplicates: true });
  if (saveError) throw saveError;
  return { status: "saved", weekStart: window.weekStart, days: snapshot.days.length };
}
