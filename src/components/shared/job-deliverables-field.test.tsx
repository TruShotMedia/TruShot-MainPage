// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { JobDeliverablesField } from "./job-deliverables-field";

it("shows existing tasks in the editor without submitting them for automatic task creation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const planned = { id: "planned", name: "New photograph", date: null };
  const linkedTasks = [{ id: "existing", title: "Existing GoPro episode", due_date: "2026-11-13", status_label: "In Progress" }];
  try {
    await act(async () => root.render(<JobDeliverablesField initialItems={[planned]} linkedTasks={linkedTasks} />));
    expect(container.querySelector('[aria-label="Linked tasks and assets"]')?.textContent).toContain("Existing GoPro episode");
    expect(JSON.parse(container.querySelector<HTMLInputElement>('input[name="deliverables"]')!.value)).toEqual([planned]);
    expect(container.querySelectorAll('input[aria-label$="name"]')).toHaveLength(1);
    await act(async () => root.render(<JobDeliverablesField key="empty" initialItems={[]} linkedTasks={linkedTasks} />));
    expect(container.textContent).not.toContain("No deliverables yet");
    expect(JSON.parse(container.querySelector<HTMLInputElement>('input[name="deliverables"]')!.value)).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
