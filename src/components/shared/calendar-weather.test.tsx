// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TabletCalendar } from "@/components/tablet/tablet-calendar";
import { useCalendarWeather } from "./calendar-weather";
import type { WeatherLocationKey } from "@/lib/calendar-weather";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("shows accessible weather details in plain language and caches a revisited period", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ snapshots: [{ week_start: "2026-10-26", captured_at: "2026-10-25T20:17:00Z", forecast_issued_at: "2026-10-25T18:00:00Z", capture_kind: "weekly", days: [{ date: "2026-10-26", condition: "rain", summary: "Rain showers", temperatureMin: 19, temperatureMax: 28, windMaxKmh: 18 }] }] }) });
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<TabletCalendar jobs={[]} tasks={[]} today="2026-10-26" density="capacity" />));
  const badge = container.querySelector<HTMLButtonElement>(".calendar-weather-badge")!;
  expect(badge.getAttribute("aria-label")).toContain("Brisbane City saved forecast");
  await act(async () => badge.click());
  const sheet = document.querySelector<HTMLElement>(".calendar-weather-dialog")!;
  expect(sheet.textContent).toContain("Kept with your calendar so you can look back at what was forecast. Actual conditions may vary.");
  expect(sheet.textContent).not.toMatch(/backfilled|forecast samples|History is not overwritten|Initial capture/);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector(".calendar-weather-dialog")).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next calendar period"]')!.click());
  expect(container.querySelector(".calendar-weather-badge")).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Previous calendar period"]')!.click());
  expect(container.querySelector(".calendar-weather-badge")).not.toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([url]) => String(url).startsWith("/api/calendar/weather?"))).toBe(true);
});

it("shows Melbourne details and keeps its cached forecast separate from Brisbane", async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    const location = new URL(url, "https://example.com").searchParams.get("location");
    return { ok: true, json: async () => ({ snapshots: [{ location_key: location, week_start: "2026-10-26", captured_at: "2026-10-25T20:17:00Z", forecast_issued_at: "2026-10-25T18:00:00Z", capture_kind: "initial", days: [{ date: "2026-10-26", condition: "sun", summary: "Clear skies", temperatureMin: 12, temperatureMax: location === "melbourne-city" ? 18 : 28, windMaxKmh: 10 }] }] }) };
  });
  vi.stubGlobal("fetch", fetch);
  const render = async (location: WeatherLocationKey) => act(async () => root.render(<TabletCalendar jobs={[]} tasks={[]} today="2026-10-26" weatherLocationKey={location} density="capacity" />));
  await render("brisbane-city");
  expect(container.querySelector(".calendar-weather-badge")?.textContent).toBe("28°");
  await render("melbourne-city");
  const badge = container.querySelector<HTMLButtonElement>(".calendar-weather-badge")!;
  expect(badge.textContent).toBe("18°");
  expect(badge.getAttribute("aria-label")).toContain("Melbourne saved forecast");
  expect(container.querySelector(".calendar-weather-credit")?.textContent).toContain("Melbourne ·");
  await act(async () => badge.click());
  const sheet = document.querySelector<HTMLElement>(".calendar-weather-dialog")!;
  expect(sheet.textContent).toContain("Melbourne");
  expect(sheet.textContent).toContain("7:17 am"); // Melbourne daylight saving, not Brisbane's 6:17 am.
  expect(sheet.textContent).not.toContain("Brisbane");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await render("brisbane-city");
  expect(container.querySelector(".calendar-weather-badge")?.textContent).toBe("28°");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("ignores a late response from the previously selected city", async () => {
  let resolveBrisbane!: (response: unknown) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveBrisbane = resolve; })).mockResolvedValue({ ok: true, json: async () => ({ snapshots: [] }) });
  vi.stubGlobal("fetch", fetch);
  function Forecast({ location }: { location: WeatherLocationKey }) {
    const { days } = useCalendarWeather("2026-10-26", "2026-11-01", location);
    return <div>{days.length ? "Saved weather" : "No weather"}</div>;
  }
  await act(async () => root.render(<Forecast location="brisbane-city" />));
  await act(async () => root.render(<Forecast location="melbourne-city" />));
  await act(async () => resolveBrisbane({ ok: true, json: async () => ({ snapshots: [{ location_key: "brisbane-city", week_start: "2026-10-26", days: [{ date: "2026-10-26" }] }] }) }));
  expect(container.textContent).toBe("No weather");
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
