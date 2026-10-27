// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TabletCalendar } from "@/components/tablet/tablet-calendar";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("shows an accessible saved-weather icon, opens its provenance, and caches a revisited period", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ snapshots: [{ week_start: "2026-10-26", captured_at: "2026-10-25T20:17:00Z", forecast_issued_at: "2026-10-25T18:00:00Z", capture_kind: "weekly", days: [{ date: "2026-10-26", condition: "rain", summary: "Rain showers", temperatureMin: 19, temperatureMax: 28, windMaxKmh: 18 }] }] }) });
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<TabletCalendar jobs={[]} tasks={[]} today="2026-10-26" density="capacity" />));
  const badge = container.querySelector<HTMLButtonElement>(".calendar-weather-badge")!;
  expect(badge.getAttribute("aria-label")).toContain("Brisbane City saved forecast");
  await act(async () => badge.click());
  const sheet = document.querySelector<HTMLElement>(".calendar-weather-dialog")!;
  expect(sheet.textContent).toContain("not a record of observed conditions");
  expect(sheet.textContent).toContain("History is not overwritten");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector(".calendar-weather-dialog")).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next calendar period"]')!.click());
  expect(container.querySelector(".calendar-weather-badge")).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Previous calendar period"]')!.click());
  expect(container.querySelector(".calendar-weather-badge")).not.toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([url]) => String(url).startsWith("/api/calendar/weather?"))).toBe(true);
});
