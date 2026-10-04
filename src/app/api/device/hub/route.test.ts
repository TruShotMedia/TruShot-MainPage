import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ getDeviceHubSnapshot: vi.fn() }));
vi.mock("@/lib/device-hub", () => ({ getDeviceHubSnapshot: mocks.getDeviceHubSnapshot }));

function request(token?: string) {
  return new Request("https://www.trushotmedia.com/api/device/hub", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

describe("GET /api/device/hub", () => {
  beforeEach(() => {
    process.env.TRUSHOT_DEVICE_TOKEN = "test-device-token";
    mocks.getDeviceHubSnapshot.mockReset();
    mocks.getDeviceHubSnapshot.mockResolvedValue({
      counts: { inbox: 1, jobsOutstanding: 6, tasksOutstanding: 19 },
      agenda: [],
      notifications: [],
      timezone: "Australia/Brisbane",
      updatedAt: "2026-10-04T06:00:00.000Z",
    });
  });

  afterEach(() => {
    delete process.env.TRUSHOT_DEVICE_TOKEN;
  });

  it("rejects missing and incorrect bearer tokens before reading CRM data", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("incorrect"))).status).toBe(401);
    expect(mocks.getDeviceHubSnapshot).not.toHaveBeenCalled();
  });

  it("returns a private, non-cacheable device snapshot", async () => {
    const response = await GET(request("test-device-token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      counts: { inbox: 1, jobsOutstanding: 6, tasksOutstanding: 19 },
      timezone: "Australia/Brisbane",
    });
  });

  it("fails closed when the CRM snapshot cannot be generated", async () => {
    mocks.getDeviceHubSnapshot.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(request("test-device-token"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Device data could not be loaded." });
  });
});
