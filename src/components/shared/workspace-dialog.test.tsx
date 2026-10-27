// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDialog } from "./workspace-dialog";

describe("workspace dialog behaviour", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it("keeps actions outside the scroll area and restores scrolling after dismissal", async () => {
    const onClose = vi.fn();
    await act(async () => root.render(<WorkspaceDialog onClose={onClose} titleId="title" header={<h2 id="title">Job</h2>} footer={<button type="button">Save</button>}><label>Title<input /></label></WorkspaceDialog>));
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialog.querySelector(".workspace-dialog-body footer")).toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe("");
  });

  it("traps keyboard focus and only dismisses the topmost nested dialog", async () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    await act(async () => root.render(<><WorkspaceDialog onClose={parentClose} titleId="parent" header={<h2 id="parent">Parent</h2>}><button>Parent action</button></WorkspaceDialog><WorkspaceDialog onClose={childClose} titleId="child" header={<h2 id="child">Child</h2>}><button>First</button><button>Last</button></WorkspaceDialog></>));
    const buttons = container.querySelectorAll<HTMLButtonElement>(".workspace-dialog:last-child button");
    const child = container.querySelector<HTMLElement>('[aria-labelledby="child"]')!;
    const first = child.querySelector<HTMLButtonElement>("button")!;
    const last = child.querySelectorAll<HTMLButtonElement>("button")[1];
    void buttons;
    last.focus();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
  });

  it("does not dismiss while saving", async () => {
    const onClose = vi.fn();
    await act(async () => root.render(<WorkspaceDialog busy onClose={onClose} titleId="busy" header={<h2 id="busy">Saving</h2>}><input /></WorkspaceDialog>));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      container.querySelector<HTMLElement>(".workspace-dialog-backdrop")!.click();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
