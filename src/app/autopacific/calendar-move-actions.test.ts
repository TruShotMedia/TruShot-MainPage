import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { moveProductionCalendarEvent } from "./calendar-move-actions";

const mocks = vi.hoisted(() => ({
  getContext: vi.fn(), revalidate: vi.fn(), sync: vi.fn(),
}));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mocks.getContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/clickup/calendar-event-sync", () => ({ scheduleClickUpCalendarEventSync: mocks.sync }));

const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-11-21T08:00:01.234567+00:00";
const input = { id, from: "2026-11-22", to: "2026-11-26", expectedUpdatedAt: updatedAt };
const oldRow = { start_date: "2026-11-21", end_date: "2026-11-23", updated_at: updatedAt };
const moved = { start_date: "2026-11-25", end_date: "2026-11-27", updated_at: "2026-11-24T10:00:00+00:00" };
const timedRow = { ...oldRow, start_date: input.from, end_date: input.from, start_time: "09:15:00", end_time: "10:05:30.25", is_all_day: false };
const retime = { ...input, to: input.from, startMinute: 10 * 60 + 15 };
const newTimes = { start_time: "10:15:00", end_time: "11:05:30.250000" };
const retimed = { start_date: input.from, end_date: input.from, ...newTimes, updated_at: moved.updated_at };

function fixture(read: unknown = [oldRow], write: unknown = [moved], changes: Record<string, string> = { start_date: moved.start_date, end_date: moved.end_date }) {
  const fetch = vi.fn(async (value: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(value));
    expect(url.pathname).toBe("/rest/v1/website-calendar-events");
    expect(url.searchParams.get("id")).toBe(`eq.${id}`);
    expect(url.searchParams.get("workspace_id")).toBe(`eq.${TRUSHOT_WORKSPACE_ID}`);
    expect(url.searchParams.get("updated_at")).toBe(`eq.${updatedAt}`);
    if (init?.method === "PATCH") {
      expect(JSON.parse(String(init.body))).toEqual({ ...changes, updated_by: userId });
      return Response.json(write);
    }
    return Response.json(read);
  });
  const client = createClient("https://example.com", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch },
  });
  mocks.getContext.mockResolvedValue({ supabase: client, membership: { workspace_id: TRUSHOT_WORKSPACE_ID }, claims: { sub: userId } });
  return fetch;
}

beforeEach(() => vi.resetAllMocks());

describe("calendar move action", () => {
  it("changes only the dates and queues the normal sync on a successful persisted move", async () => {
    const fetch = fixture();
    expect(await moveProductionCalendarEvent(input)).toEqual({ ok: true, dates: moved });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.revalidate).toHaveBeenCalledWith("/marketing");
    expect(mocks.sync).toHaveBeenCalledOnce();
  });

  it.each([[[], [moved], 1], [[oldRow], [], 2]])("does not sync a hidden event or overwrite a concurrent edit", async (read, write, requests) => {
    const fetch = fixture(read, write);
    expect(await moveProductionCalendarEvent(input)).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
    expect(fetch).toHaveBeenCalledTimes(requests);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not read invalid dates, non-CRM IDs or unauthenticated requests", async () => {
    expect((await moveProductionCalendarEvent({ ...input, to: "2026-02-30" })).ok).toBe(false);
    expect((await moveProductionCalendarEvent({ ...input, id: "outlook-placeholder" })).ok).toBe(false);
    expect(mocks.getContext).not.toHaveBeenCalled();
    mocks.getContext.mockResolvedValue(null);
    expect((await moveProductionCalendarEvent(input)).ok).toBe(false);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not update on a drop onto the same day", async () => {
    const fetch = fixture();
    expect(await moveProductionCalendarEvent({ ...input, to: input.from })).toEqual({ ok: true, dates: oldRow });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("only writes the new start/end times and retains the original duration and date", async () => {
    const fetch = fixture([timedRow], [retimed], newTimes);
    expect(await moveProductionCalendarEvent(retime)).toEqual({ ok: true, dates: retimed });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.revalidate).toHaveBeenCalledWith("/autopacific/mobile");
    expect(mocks.sync).toHaveBeenCalledOnce();
  });

  it("does not write when a valid drop leaves the starting time unchanged", async () => {
    const fetch = fixture([timedRow]);
    const result = await moveProductionCalendarEvent({ ...retime, startMinute: 9 * 60 + 15 });
    expect(result).toMatchObject({ ok: true, dates: { start_time: "09:15:00", updated_at: updatedAt } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...timedRow, is_all_day: true, start_time: null, end_time: null }, 615],
    [{ ...timedRow, end_date: "2026-11-23" }, 615],
    [timedRow, 23 * 60 + 45],
  ])("rejects non-timed, overnight, or midnight-crossing drops without writing", async (row, startMinute) => {
    const fetch = fixture([row]);
    expect(await moveProductionCalendarEvent({ ...retime, startMinute })).toMatchObject({ ok: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("rejects non-grid times before contacting the database", async () => {
    expect((await moveProductionCalendarEvent({ ...retime, startMinute: 616 })).ok).toBe(false);
    expect(mocks.getContext).not.toHaveBeenCalled();
  });

  it("saves a Week drop's new day and time in one guarded update without changing the duration", async () => {
    const to = "2026-11-24";
    const changes = { start_date: to, end_date: to, ...newTimes };
    const result = { ...changes, updated_at: moved.updated_at };
    const fetch = fixture([timedRow], [result], changes);
    expect(await moveProductionCalendarEvent({ ...retime, to })).toEqual({ ok: true, dates: result });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.sync).toHaveBeenCalledOnce();
  });

  it("does not save any fields on a cross-day drop that would run past midnight", async () => {
    const fetch = fixture([timedRow]);
    expect((await moveProductionCalendarEvent({ ...retime, to: "2026-11-24", startMinute: 23 * 60 + 45 })).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not sync when another edit wins before the guarded time write", async () => {
    const fetch = fixture([timedRow], [], newTimes);
    expect(await moveProductionCalendarEvent(retime)).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
