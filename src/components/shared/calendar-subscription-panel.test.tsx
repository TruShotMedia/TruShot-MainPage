// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CalendarSubscriptionPanel } from "./calendar-subscription-panel";
let container: HTMLDivElement, root: Root;
const fetchMock = vi.fn(), copy = vi.fn();
beforeEach(() => { fetchMock.mockReset(); copy.mockReset(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetchMock); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const response = (body: unknown) => ({ ok: true, json: async () => body });
const click = async (text: string) => { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === text)!.click()); };
it("loads once, creates/copies a masked one-time link, and requires confirmation before revoke", async () => {
  fetchMock.mockResolvedValueOnce(response({ enabled: false, rotated_at: null }));
  await act(async () => root.render(<CalendarSubscriptionPanel />)); expect(fetchMock).toHaveBeenCalledOnce();
  fetchMock.mockResolvedValueOnce(response({ enabled: true, url: "PRIVATE-LINK", rotated_at: "2026-11-10" }));
  await click("Create private subscription link");
  expect(container.querySelector('input[type="password"]')?.getAttribute("value")).toBe("PRIVATE-LINK");
  await click("Copy link"); expect(copy).toHaveBeenCalledWith("PRIVATE-LINK");
  await click("Revoke access"); expect(fetchMock).toHaveBeenCalledTimes(2); expect(container.textContent).toContain("Previously downloaded events may remain");
  fetchMock.mockResolvedValueOnce(response({ enabled: false, rotated_at: null }));
  await click("Revoke private link"); expect(container.querySelector("input")).toBeNull();
  expect(container.textContent).toContain("Link revoked");
});
it("never retrieves an existing bearer link and does not persist it in browser storage", async () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  fetchMock.mockResolvedValue(response({ enabled: true, rotated_at: "2026-11-10" }));
  await act(async () => root.render(<CalendarSubscriptionPanel />));
  expect(container.querySelector("input")).toBeNull(); expect(container.textContent).toContain("Replace link"); expect(setItem).not.toHaveBeenCalled(); setItem.mockRestore();
});
