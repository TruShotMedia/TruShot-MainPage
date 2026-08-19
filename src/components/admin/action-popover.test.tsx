// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionPopover } from "./action-popover";

describe("ActionPopover", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderPopover(action = vi.fn(async (formData: FormData) => { void formData; })) {
    await act(async () => {
      root.render(
        <ActionPopover action={action} summary="New client" title="Add a client">
          <label>Name<input name="name" defaultValue="Test client" /></label>
          <button type="submit">Create client</button>
        </ActionPopover>,
      );
    });
    return { action, details: container.querySelector("details")!, form: container.querySelector("form")! };
  }

  it("resets and closes after a successful action", async () => {
    const { action, details, form } = await renderPopover();
    details.open = true;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    nameInput.value = "Changed client";

    await act(async () => form.requestSubmit());

    expect(action).toHaveBeenCalledOnce();
    expect(details.open).toBe(false);
    expect(nameInput.value).toBe("Test client");
  });

  it("can be dismissed with the close button", async () => {
    const { details } = await renderPopover();
    details.open = true;
    const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="Close Add a client"]')!;

    await act(async () => closeButton.click());

    expect(details.open).toBe(false);
  });

  it("can be dismissed with Escape", async () => {
    const { details } = await renderPopover();
    details.open = true;

    await act(async () => details.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

    expect(details.open).toBe(false);
  });

  it("stays open and reports an error when the action fails", async () => {
    const action = vi.fn(async () => { throw new Error("Save failed"); });
    const { details, form } = await renderPopover(action);
    details.open = true;

    await act(async () => form.requestSubmit());

    expect(details.open).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be saved");
  });
});
