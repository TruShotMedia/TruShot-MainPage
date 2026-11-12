// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarCreateMenu } from "./calendar-create-menu";

let host: HTMLDivElement, root: Root;
const create = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); host.className = "apg-desktop is-dark"; document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(productionTools = true) { await act(async () => root.render(<CalendarCreateMenu date="2026-11-12" productionTools={productionTools} onCreate={create} />)); }
async function show() { await act(async () => host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click()); }
const items = () => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
describe("calendar creation menu", () => {
  it.each([true, false])("offers only existing permitted creation options (%s)", async productionTools => {
    await render(productionTools); await show();
    expect(items().map(button => button.textContent)).toEqual(productionTools ? ["Job brief", "Calendar event", "Task / asset", "Flight plan"] : ["Job brief", "Calendar event"]);
    expect(create).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-expanded="true"]')).not.toBeNull();
    expect(host.querySelector('[role="menu"]')?.parentElement).toBe(host);
  });
  it.each(["job", "event", "task", "flight"])("passes the selected date to %s and closes before opening its editor", async kind => {
    await render(); await show();
    const index = ["job", "event", "task", "flight"].indexOf(kind);
    await act(async () => items()[index].click());
    expect(create).toHaveBeenCalledWith(kind, "2026-11-12");
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });
  it("supports keyboard navigation and Escape with focus returned to the plus", async () => {
    await render(); await show();
    expect(document.activeElement).toBe(items()[0]);
    const key = async (value: string) => { await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }))); };
    await key("ArrowDown"); expect(document.activeElement).toBe(items()[1]);
    await key("End"); expect(document.activeElement).toBe(items().at(-1));
    await key("Home"); expect(document.activeElement).toBe(items()[0]);
    await key("ArrowUp"); expect(document.activeElement).toBe(items().at(-1));
    await key("Escape"); expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[aria-haspopup="menu"]'));
    expect(create).not.toHaveBeenCalled();
  });
  it("closes on outside tap, trigger toggle or focus leaving the menu", async () => {
    await render(); await show();
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    await show(); await show(); expect(host.querySelector('[role="menu"]')).toBeNull();
    await show(); const outside = document.createElement("button"); document.body.append(outside);
    await act(async () => outside.focus()); expect(host.querySelector('[role="menu"]')).toBeNull(); outside.remove();
  });
  it("fits the popup inside a narrow viewport and flips above a low trigger", async () => {
    vi.stubGlobal("innerWidth", 390); vi.stubGlobal("innerHeight", 844);
    await render();
    const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ top: 800, bottom: 836, right: 380, left: 344, width: 36, height: 36, x: 344, y: 800, toJSON: () => ({}) });
    await show(); const menu = host.querySelector<HTMLDivElement>('[role="menu"]')!;
    expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(12);
    expect(parseFloat(menu.style.left) + parseFloat(menu.style.width)).toBeLessThanOrEqual(378);
    expect(parseFloat(menu.style.top)).toBeLessThan(800);
  });
});
