// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CalendarEventEditor } from "./calendar-event-editor";
import type { CalendarCustomEvent } from "@/lib/types";

const actions = vi.hoisted(() => ({ createCalendarEvent: vi.fn(), updateCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn() }));
vi.mock("@/app/admin/actions", () => actions);

const date = "2026-11-27";
const post: CalendarCustomEvent = {
  id: "sample", entity_type: "calendar-event", event_kind: "post", title: "Launch reel", client_id: null, client_name: null,
  description: "Instagram", location: null, start_date: date, end_date: date, start_time: "18:00", end_time: "18:15",
  is_all_day: false, color: "#1f5e41", reminder_offsets_minutes: [0], created_at: "", updated_at: "",
};

it.each([false, true])("submits the scheduled post kind on %s (editing)", async editing => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSaved = vi.fn();
  const action = editing ? actions.updateCalendarEvent : actions.createCalendarEvent;
  action.mockResolvedValueOnce({ ok: true, event: post });
  try {
    await act(async () => root.render(<CalendarEventEditor defaultDate={date} defaultKind={editing ? "event" : "post"}
      event={editing ? post : null} onSaved={onSaved} onClose={vi.fn()} onDeleted={vi.fn()} />));
    expect(container.textContent).toContain("won’t publish automatically");
    expect(container.textContent).toContain(editing ? "Publish time" : "Due date");
    const title = container.querySelector<HTMLInputElement>('[name="title"]')!;
    if (!editing) {
      expect(container.querySelector<HTMLInputElement>('[name="is_all_day"]')?.checked).toBe(true);
      expect(container.querySelector('[name="end_time"]')).toBeNull();
      title.value = post.title;
    }
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    const form = action.mock.lastCall![0] as FormData;
    expect(form.get("event_kind")).toBe("post");
    expect(form.get("is_all_day")).toBe(editing ? null : "on");
    expect(form.get("start_date")).toBe(date);
    expect(form.get("title")).toBe(post.title);
    expect(onSaved).toHaveBeenCalledWith(post);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
