import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));

type Result = { data?: Array<{ id: string }>; count?: number | null; error: { message: string } | null };

const results: Record<string, Result> = {
  "website-enquiries": { count: 2, error: null },
  "website-job-metrics": { count: 7, error: null },
  "website-task-statuses": { data: [{ id: "open-1" }, { id: "open-2" }], error: null },
  "website-job-tasks": { count: 24, error: null },
};

function request(token?: string) {
  return new Request("https://www.trushotmedia.com/api/widget/summary", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe("GET /api/widget/summary", () => {
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      gt: () => query,
      in: () => query,
      is: () => query,
      then: (resolve: (value: Result) => void) => Promise.resolve(results[table]).then(resolve),
    };
    return query;
  });

  beforeEach(() => {
    process.env.SCRIPTABLE_WIDGET_TOKEN = "test-widget-token";
    from.mockClear();
    mocks.createServiceClient.mockReset();
    mocks.createServiceClient.mockReturnValue({ from });
    results["website-enquiries"] = { count: 2, error: null };
  });

  afterEach(() => {
    delete process.env.SCRIPTABLE_WIDGET_TOKEN;
  });

  it("rejects missing and incorrect bearer tokens before reading CRM data", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("incorrect"))).status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("returns the three live workload counts without cacheable credentials", async () => {
    const response = await GET(request("test-widget-token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ inbox: 2, jobsOutstanding: 7, tasksOutstanding: 24 });
    expect(from).toHaveBeenCalledWith("website-enquiries");
    expect(from).toHaveBeenCalledWith("website-job-metrics");
    expect(from).toHaveBeenCalledWith("website-job-tasks");
  });

  it("fails closed when CRM data cannot be read", async () => {
    results["website-enquiries"] = { count: null, error: { message: "database unavailable" } };
    const response = await GET(request("test-widget-token"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Widget data could not be loaded." });
  });
});
