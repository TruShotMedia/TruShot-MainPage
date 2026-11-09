// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("./workspace-dialog", () => ({ WorkspaceDialog: ({ children, header, footer }: { children: ReactNode; header: ReactNode; footer: ReactNode }) => <section role="dialog">{header}{children}{footer}</section> }));
import { OutlookCalendarConnection } from "./outlook-calendar-connection";
import { OutlookEventDetails } from "./outlook-event-details";
import { CalendarEventEditor } from "@/components/admin/calendar-event-editor";
import type { CalendarCustomEvent } from "@/lib/types";
let container: HTMLDivElement, root: Root;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", mocks.fetch); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = async (node: ReactNode) => { await act(async () => root.render(node)); };
const open = async () => { await act(async () => container.querySelector("button")!.click()); };
const event: CalendarCustomEvent = { id: "outlook-private", entity_type: "calendar-event", external_source: "outlook", external_calendar_name: "Work", title: "Published title", description: "Private details", location: "Geebung", start_date: "2026-11-10", start_time: "09:00", end_date: "2026-11-10", end_time: "10:00", is_all_day: false, color: "#647b91", client_id: null, client_name: null, reminder_offsets_minutes: [], created_at: "", updated_at: "" };
it("loads connection details only when opened, with no automatic polling", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ calendars: [] }) });
  await render(<OutlookCalendarConnection />);
  expect(mocks.fetch).not.toHaveBeenCalled();
  await open();
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(container.querySelector('input[name="feed_url"]')?.getAttribute("type")).toBe("password");
  expect(container.textContent).toContain("Private to your login");
});
it("shows status and a confirmation before disconnecting, never the secret link", async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ calendars: [{ id: "one", name: "Work", last_success_at: null, last_error: null, event_count: 12 }] }) });
  await render(<OutlookCalendarConnection />); await open();
  expect(container.textContent).toContain("12 events available");
  expect(container.querySelector('input[name="feed_url"]')).toBeNull();
  const disconnect = [...container.querySelectorAll("button")].find(button => button.textContent === "Disconnect")!;
  await act(async () => disconnect.click());
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Your Outlook calendar will stay unchanged");
});
it("uses a read-only detail view even if the common event editor is requested", async () => {
  await render(<CalendarEventEditor event={event} defaultDate={event.start_date} onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />);
  expect(container.textContent).toContain("Published title");
  expect(container.textContent).toContain("Outlook · Read only");
  expect(container.querySelector("input,textarea,select")).toBeNull();
  expect(container.textContent).not.toContain("Save event");
  expect(container.textContent).not.toContain("Delete");
});
it("renders source details as plain text, never executable HTML", async () => {
  await render(<OutlookEventDetails event={{ ...event, description: '<img src=x onerror="alert(1)">' }} onClose={vi.fn()} />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("<img src=x");
});
