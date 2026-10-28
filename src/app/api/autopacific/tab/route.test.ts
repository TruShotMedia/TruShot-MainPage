import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarCustomEvent, TabletKioskData } from "@/lib/types";
import { scopeCalendarForWorkspace } from "@/lib/marketing-calendar-scope";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ context: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mocks.context, getTabletKioskData: mocks.load }));

const event = (title: string, client_name: string | null = null): CalendarCustomEvent => ({
  id: title, title, client_name, client_id: null, entity_type: "calendar-event", description: null, location: null,
  start_date: "2026-11-06", end_date: "2026-11-06", start_time: "19:00:00", end_time: "21:00:00", is_all_day: false,
  color: "#579", reminder_offsets_minutes: [], created_at: "2026-10-28T00:00:00Z", updated_at: "2026-10-28T00:00:00Z",
});
const fixture: TabletKioskData = {
  clientOptions: [], jobOptions: [], statuses: [], jobStatuses: [], pipelineJobs: [], pipelineTasks: [], calendarJobs: [], calendarTasks: [], calendarCampaignAssets: [], flightEvents: [], pendingRequestCount: 0,
  calendarEvents: [event("INGREIGN"), event("Ingreign Recap Video"), event("Friday service", "INGREIGN"), event("Marketing meeting"), event("Other appointment")],
};

describe("workspace calendar visibility", () => {
  beforeEach(() => { mocks.context.mockResolvedValue({ access: "autopacific" }); mocks.load.mockResolvedValue(fixture); });

  it("keeps Production intact and excludes INGREIGN from Marketing without mutating source data", () => {
    expect(scopeCalendarForWorkspace(fixture, "production")).toBe(fixture);
    expect(scopeCalendarForWorkspace(fixture, "marketing").calendarEvents.map(item => item.title)).toEqual(["Marketing meeting", "Other appointment"]);
    expect(fixture.calendarEvents).toHaveLength(5);
  });

  it("returns a filtered Marketing refresh with a different ETag from Production", async () => {
    const production = await GET(new Request("https://example.test/api/autopacific/tab?view=schedule"));
    const productionTag = production.headers.get("etag")!;
    expect((await production.json()).calendarEvents).toHaveLength(5);
    const marketing = await GET(new Request("https://example.test/api/autopacific/tab?view=schedule&mode=marketing", { headers: { "If-None-Match": productionTag } }));
    expect(marketing.status).toBe(200);
    expect(marketing.headers.get("etag")).not.toBe(productionTag);
    expect((await marketing.json()).calendarEvents.map((item: CalendarCustomEvent) => item.title)).toEqual(["Marketing meeting", "Other appointment"]);
    const unchanged = await GET(new Request("https://example.test/api/autopacific/tab?view=schedule&mode=marketing", { headers: { "If-None-Match": marketing.headers.get("etag")! } }));
    expect(unchanged.status).toBe(304);
    expect(marketing.headers.get("cache-control")).toContain("private");
  });

  it("still requires authenticated, MFA-checked Production context", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await GET(new Request("https://example.test/api/autopacific/tab?view=schedule&mode=marketing"))).status).toBe(401);
  });
});
