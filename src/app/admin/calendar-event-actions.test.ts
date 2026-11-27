import { beforeEach, expect, it, vi } from "vitest";
import { createCalendarEvent, updateCalendarEvent } from "./actions";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), getContext: vi.fn(), revalidate: vi.fn(), schedule: vi.fn(),
}));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mocks.getContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/clickup/calendar-event-sync", () => ({ scheduleClickUpCalendarEventSync: mocks.schedule }));

const id = "5e525720-5fe7-4783-a88c-6efddc4c573a";
const query = { insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  for (const method of [query.insert, query.update, query.eq, query.select]) method.mockReturnValue(query);
  query.single.mockResolvedValue({ data: { id, event_kind: "post" }, error: null });
  mocks.from.mockReturnValue(query);
  mocks.getContext.mockResolvedValue({ supabase: { from: mocks.from }, claims: { sub: id } });
});

function form(kind?: string) {
  const values = new FormData();
  for (const [key, value] of Object.entries({ id, title: "Launch reel", description: "", location: "", color: "#1f5e41",
    start_date: "2026-11-27", end_date: "2026-11-27", start_time: "18:00", end_time: "18:15" })) values.set(key, value);
  if (kind !== undefined) values.set("event_kind", kind);
  return values;
}

it("persists a post on the normal calendar event path and refreshes Marketing", async () => {
  expect(await createCalendarEvent(form("post"))).toMatchObject({ ok: true, event: { entity_type: "calendar-event", event_kind: "post" } });
  expect(mocks.from).toHaveBeenCalledWith("website-calendar-events");
  expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: TRUSHOT_WORKSPACE_ID, event_kind: "post", start_time: "18:00" }));
  expect(query.select).toHaveBeenCalledWith(expect.stringContaining("event_kind"));
  expect(mocks.revalidate).toHaveBeenCalledWith("/marketing");
  expect(mocks.schedule).toHaveBeenCalledOnce();
});

it("leaves the stored kind alone for a legacy client editing an entry", async () => {
  expect((await updateCalendarEvent(form())).ok).toBe(true);
  expect(query.update.mock.lastCall?.[0]).not.toHaveProperty("event_kind");
});

it("saves a date-only post without booking any clock times", async () => {
  const data = form("post");
  data.set("is_all_day", "on");
  data.delete("start_time");
  data.delete("end_time");
  expect((await createCalendarEvent(data)).ok).toBe(true);
  expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ event_kind: "post", is_all_day: true, start_time: null, end_time: null }));
});

it("rejects unknown kinds before attempting to write", async () => {
  expect((await createCalendarEvent(form("publish"))).ok).toBe(false);
  expect(mocks.getContext).not.toHaveBeenCalled();
});
