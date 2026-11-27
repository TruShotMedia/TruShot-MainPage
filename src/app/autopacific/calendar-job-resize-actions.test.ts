import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { resizeProductionCalendarJob } from "./calendar-job-resize-actions";

const mocks = vi.hoisted(() => ({ context: vi.fn(), sync: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mocks.context }));
vi.mock("@/lib/clickup/job-sync", () => ({ scheduleClickUpJobSync: mocks.sync }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const updated_at = "2026-11-27T00:11:00.245631+00:00";
const change = { id, expectedUpdatedAt: updated_at, date: "2026-11-27" };
const schedule = { shoot_date: change.date, shoot_time: "09:00:00", shoot_end_time: "10:00:00", due_date: "2026-12-02", updated_at };
const job = { ...schedule, client: { name: "AutoPacific Group" }, status: { key: "scheduled", is_closed: false }, assignee_ids: [userId] };
type FixtureJob = Omit<typeof job, "shoot_end_time" | "due_date"> & { shoot_end_time: string | null; due_date: string | null };

function fixture({ row = job, allowSave = true, expectedPatch, role = "marketing" }: {
  row?: FixtureJob | null; allowSave?: boolean; expectedPatch?: Record<string, string>; role?: string;
} = {}) {
  const fetch = vi.fn(async (value: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(value));
    expect(url.pathname).toBe("/rest/v1/website-jobs");
    expect(url.searchParams.get("id")).toBe(`eq.${id}`);
    expect(url.searchParams.get("archived_at")).toBe("is.null");
    expect(url.searchParams.get("workspace_id")).toBe(`eq.${TRUSHOT_WORKSPACE_ID}`);
    expect(url.searchParams.get("updated_at")).toBe(`eq.${updated_at}`);
    if (init?.method === "PATCH") {
      expect(JSON.parse(String(init.body))).toEqual({ ...expectedPatch, updated_by: userId });
      return Response.json(allowSave ? [{ ...schedule, ...expectedPatch, updated_at: "2026-11-27T02:30:00+00:00" }] : []);
    }
    return Response.json(row ? [row] : []);
  });
  const supabase = createClient("https://example.com", "test-key", { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch } });
  mocks.context.mockResolvedValue({ supabase, access: "autopacific", claims: { sub: userId }, membership: { workspace_id: TRUSHOT_WORKSPACE_ID }, team: { role } });
  return fetch;
}

beforeEach(() => vi.resetAllMocks());

it.each([
  ["start", "2026-11-26", { shoot_date: "2026-11-26" }],
  ["end", "2026-12-07", { due_date: "2026-12-07" }],
] as const)("changes only the %s date and runs the existing job sync", async (edge, date, expectedPatch) => {
  const fetch = fixture({ expectedPatch });
  expect(await resizeProductionCalendarJob({ ...change, axis: "date", edge, date })).toMatchObject({ ok: true, job: expectedPatch });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(mocks.sync).toHaveBeenCalledOnce();
  expect(mocks.revalidate).toHaveBeenCalledWith("/marketing");
});

it("keeps the deadline unchanged when extending the shoot, even for a multi-day job", async () => {
  fixture({ expectedPatch: { shoot_end_time: "11:30:00" } });
  expect(await resizeProductionCalendarJob({ ...change, axis: "time", edge: "end", minute: 690 }))
    .toMatchObject({ ok: true, job: { shoot_end_time: "11:30:00", due_date: job.due_date } });
});

it("keeps the calendar's displayed finish when pulling the start of a shoot without an end time", async () => {
  const expectedPatch = { shoot_time: "08:45:00", shoot_end_time: "09:30:00" };
  fixture({ row: { ...job, shoot_end_time: null }, expectedPatch });
  expect(await resizeProductionCalendarJob({ ...change, axis: "time", edge: "start", minute: 525 }))
    .toMatchObject({ ok: true, job: expectedPatch });
});
it("lets a shoot-only job gain a deadline by extending its right edge", async () => {
  const date = "2026-11-30";
  fixture({ row: { ...job, due_date: null }, expectedPatch: { due_date: date } });
  expect(await resizeProductionCalendarJob({ ...change, date, axis: "date", edge: "end" }))
    .toMatchObject({ ok: true, job: { due_date: date } });
});

it.each([
  { axis: "date", edge: "end", date: "2026-11-26" },
  { axis: "date", edge: "start", date: "2026-12-03" },
  { axis: "date", edge: "end", date: "2026-11-29" },
  { axis: "time", edge: "start", minute: 600 },
  { axis: "time", edge: "end", date: "2026-11-30", minute: 630 },
])("rejects a resize that crosses an endpoint, changes the wrong day, or selects a weekend (%j)", async adjustment => {
  const fetch = fixture();
  expect(await resizeProductionCalendarJob({ ...change, ...adjustment })).toMatchObject({ ok: false });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mocks.sync).not.toHaveBeenCalled();
});

it.each([
  { ...job, assignee_ids: ["other"] },
  { ...job, status: { key: "delayed", is_closed: false } },
  { ...job, status: { key: "delivered", is_closed: true } },
  { ...job, client: { name: "Unrelated client" } },
  null,
])("cannot change a blocked, unassigned Marketing, or invisible job (%j)", async row => {
  const fetch = fixture({ row });
  expect(await resizeProductionCalendarJob({ ...change, axis: "date", edge: "end", date: "2026-12-03" })).toMatchObject({ ok: false });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mocks.sync).not.toHaveBeenCalled();
});

it("does not overwrite a job edited concurrently", async () => {
  fixture({ allowSave: false, expectedPatch: { due_date: "2026-12-03" } });
  expect(await resizeProductionCalendarJob({ ...change, axis: "date", edge: "end", date: "2026-12-03" })).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
  expect(mocks.sync).not.toHaveBeenCalled();
});
