"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, MapPin, Sun, Wind, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";
import { flattenWeatherSnapshots, WEATHER_LOCATION, WEATHER_LOCATIONS, type CalendarWeatherSnapshot, type SavedCalendarWeather, type WeatherCondition, type WeatherLocationKey } from "@/lib/calendar-weather";

const icons = { sun: Sun, "partly-cloudy": CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, storm: CloudLightning, snow: CloudSnow };

export function WeatherIcon({ condition, size = 16 }: { condition: WeatherCondition; size?: number }) {
  const Icon = icons[condition] ?? Cloud;
  return <Icon size={size} aria-hidden="true" />;
}

/** Reads immutable saved snapshots only; never contacts a weather provider on navigation. */
export function useCalendarWeather(start: string, end: string, locationKey: WeatherLocationKey = WEATHER_LOCATION.key) {
  const [result, setResult] = useState<{ key: string; days: SavedCalendarWeather[]; status: "ready" | "unavailable" }>({ key: "", days: [], status: "ready" });
  const cache = useRef(new Map<string, { savedAt: number; days: SavedCalendarWeather[] }>());
  const key = `${locationKey}:${start}:${end}`;

  useEffect(() => {
    let controller: AbortController | undefined;
    let lastFetch = 0;
    let active = true;
    async function load() {
      if (!active || document.visibilityState === "hidden" || Date.now() - lastFetch < 300_000) return;
      const cached = cache.current.get(key);
      if (cached && Date.now() - cached.savedAt < 300_000) {
        setResult({ key, days: cached.days, status: "ready" });
        lastFetch = cached.savedAt;
        return;
      }
      controller?.abort();
      controller = new AbortController();
      lastFetch = Date.now();
      try {
        const response = await fetch(`/api/calendar/weather?start=${start}&end=${end}&location=${locationKey}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Weather unavailable");
        const body = await response.json() as { snapshots: CalendarWeatherSnapshot[] };
        const days = flattenWeatherSnapshots(body.snapshots, locationKey).filter((day) => day.date >= start && day.date <= end);
        if (!active) return;
        cache.current.set(key, { savedAt: Date.now(), days });
        setResult({ key, days, status: "ready" });
      } catch (error) {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        setResult({ key, days: cache.current.get(key)?.days ?? [], status: "unavailable" });
      }
    }
    void load();
    document.addEventListener("visibilitychange", load);
    // Re-read the saved data, not the provider, across Sunday capture / midnight in a kiosk.
    const interval = window.setInterval(load, 30 * 60_000);
    return () => { active = false; controller?.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", load); };
  }, [end, key, locationKey, start]);

  return { days: result.key === key ? result.days : [], unavailable: result.key === key && result.status === "unavailable" };
}

export function CalendarWeatherBadge({ day, onOpen }: { day?: SavedCalendarWeather; onOpen: (day: SavedCalendarWeather) => void }) {
  if (!day) return null;
  return <button type="button" className={`calendar-weather-badge weather-${day.condition}`} onClick={() => onOpen(day)} aria-label={`${WEATHER_LOCATIONS[day.location_key].name} saved forecast for ${format(parseISO(day.date), "d MMMM")}: ${day.summary}, ${day.temperatureMin} to ${day.temperatureMax} degrees`} title={`${day.summary} · ${day.temperatureMin}–${day.temperatureMax}°C · Saved forecast`}><WeatherIcon condition={day.condition} /><span>{day.temperatureMax}°</span></button>;
}

export function CalendarWeatherCredit({ unavailable, locationKey = WEATHER_LOCATION.key }: { unavailable: boolean; locationKey?: WeatherLocationKey }) {
  return <p className="calendar-weather-credit"><MapPin size={11} /><span>{WEATHER_LOCATIONS[locationKey].label} · {unavailable ? "Weather temporarily unavailable" : "Saved weekly forecast"}</span><a href="https://www.met.no/en/free-meteorological-data/Licensing-and-crediting" target="_blank" rel="noreferrer">MET Norway · CC BY 4.0</a></p>;
}

export function CalendarWeatherDetails({ day, onClose }: { day: SavedCalendarWeather; onClose: () => void }) {
  const [host] = useState(() => typeof document === "undefined" ? null : document.querySelector(".tablet-kiosk, .apg-desktop") ?? document.body);
  const location = WEATHER_LOCATIONS[day.location_key];
  const captured = new Intl.DateTimeFormat("en-AU", { timeZone: location.timezone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(day.captured_at));
  if (!host) return null;
  return createPortal(<WorkspaceDialog className="calendar-weather-dialog" titleId="calendar-weather-title" onClose={onClose} header={<><div><span><MapPin size={13} /> {location.name}</span><h2 id="calendar-weather-title">{format(parseISO(day.date), "EEEE, d MMMM")}</h2><p>The forecast for this day.</p></div><button type="button" onClick={onClose} aria-label="Close weather details"><X size={18} /></button></>} footer={<button className="admin-primary-button" type="button" onClick={onClose}>Done</button>}>
    <div className={`calendar-weather-hero weather-${day.condition}`}><WeatherIcon condition={day.condition} size={56} /><div><strong>{day.temperatureMax}°<small> / {day.temperatureMin}°</small></strong><span>{day.summary}</span></div></div>
    <div className="calendar-weather-wind"><Wind size={17} /><span>Forecast wind up to <strong>{day.windMaxKmh} km/h</strong></span></div>
    <aside className="calendar-weather-explanation"><strong>Forecast saved {captured}</strong><p>Kept with your calendar so you can look back at what was forecast. Actual conditions may vary.</p></aside>
    <CalendarWeatherCredit unavailable={false} locationKey={day.location_key} />
  </WorkspaceDialog>, host);
}
