// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCalendarToday } from "./use-calendar-today";

let container: HTMLDivElement, root: Root;
function Today({ initialToday = "2026-11-10" }: { initialToday?: string }) {
  return <time>{useCalendarToday(initialToday)}</time>;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  vi.setSystemTime(new Date("2026-11-10T23:59:59+10:00"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  ["2026-11-10", "2026-11-11"],
  ["2026-11-30", "2026-12-01"],
  ["2026-12-31", "2027-01-01"],
])("rolls over at Brisbane midnight, including month/year boundaries (%s)", async (before, after) => {
  vi.setSystemTime(new Date(`${before}T23:59:59+10:00`));
  await act(async () => root.render(<Today initialToday={before} />));
  expect(container.textContent).toBe(before);
  await act(async () => vi.advanceTimersByTime(1_000));
  expect(container.textContent).toBe(after);
  expect(vi.getTimerCount()).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["focus", "pageshow", "visibilitychange"])("catches up after a sleeping app resumes through %s", async event => {
  await act(async () => root.render(<Today />));
  vi.setSystemTime(new Date("2026-11-17T08:00:00+10:00"));
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)));
  expect(container.textContent).toBe("2026-11-17");
  expect(vi.getTimerCount()).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
  visibility.mockRestore();
});

it("uses the actual date on mount even when the server payload has an old date", async () => {
  vi.setSystemTime(new Date("2026-11-17T00:15:00+10:00"));
  await act(async () => root.render(<Today />));
  expect(container.textContent).toBe("2026-11-17");
});

it("hydrates the server date safely before catching up to the real date", async () => {
  vi.setSystemTime(new Date("2026-11-17T00:15:00+10:00"));
  const html = renderToString(<Today />);
  expect(html).toContain("2026-11-10");
  await act(async () => root.unmount());
  container.innerHTML = html;
  const errors: unknown[] = [];
  await act(async () => { root = hydrateRoot(container, <Today />, { onRecoverableError: error => errors.push(error) }); });
  expect(errors).toEqual([]);
  expect(container.textContent).toBe("2026-11-17");
});

it("removes its midnight timer and resume listeners when the workspace closes", async () => {
  const removeWindow = vi.spyOn(window, "removeEventListener");
  const removeDocument = vi.spyOn(document, "removeEventListener");
  await act(async () => root.render(<Today />));
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  expect(removeWindow).toHaveBeenCalledWith("focus", expect.any(Function));
  expect(removeWindow).toHaveBeenCalledWith("pageshow", expect.any(Function));
  expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  removeWindow.mockRestore();
  removeDocument.mockRestore();
});
