// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { JobScheduleFields } from "./job-schedule-fields";

describe("optional planning schedule", () => {
  for (const dated of [false,true]) it(dated ? "can clear an existing planning schedule" : "keeps planning undated until Add dates is chosen", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
    try {
      await act(async()=>root.render(<form><JobScheduleFields planning initial={dated ? {shoot_date:"2026-11-02",due_date:"2026-11-06"} : {}} /></form>));
      expect(container.querySelectorAll('input[type="date"]').length).toBe(dated?2:0);
      await act(async()=>container.querySelector<HTMLButtonElement>("button")!.click());
      expect(container.querySelectorAll('input[type="date"]').length).toBe(dated?0:2);
      const form=new FormData(container.querySelector("form")!);
      expect(form.get("shoot_date")).toBe("");expect(form.get("due_date")).toBe("");
      expect(container.querySelectorAll("input[required]").length).toBe(0);
    } finally {await act(async()=>root.unmount());container.remove();}
  });
});
