import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const capture = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "already-saved", weekStart: "2026-10-26" }));
vi.mock("@/lib/calendar-weather-server", () => ({ captureCalendarWeather: capture }));
afterEach(() => { vi.unstubAllEnvs(); capture.mockClear(); });

it("rejects requests without the scheduled task secret", async () => {
  vi.stubEnv("CRON_SECRET", "test-weather-secret");
  for (const authorization of ["", "Bearer wrong", "test-weather-secret"]) expect((await POST(new Request("https://example.com/api/cron/calendar-weather", { method: "POST", headers: { authorization } }))).status).toBe(401);
  expect(capture).not.toHaveBeenCalled();
});

it("runs an authenticated capture safely when a snapshot already exists", async () => {
  vi.stubEnv("CRON_SECRET", "test-weather-secret");
  const result = await POST(new Request("https://example.com/api/cron/calendar-weather", { method: "POST", headers: { authorization: "Bearer test-weather-secret" } }));
  expect(result.status).toBe(200);
  expect(capture).toHaveBeenCalledWith(expect.any(Date), "brisbane-city");
  expect(capture).toHaveBeenCalledWith(expect.any(Date), "melbourne-city");
  expect(await result.json()).toMatchObject({ ok: true, captures: [{ status: "already-saved" }, { status: "already-saved" }] });
});

it("allows each city to finish and requests a retry if only one capture fails", async () => {
  vi.stubEnv("CRON_SECRET", "test-weather-secret");
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  capture.mockRejectedValueOnce(new Error("Provider unavailable")).mockResolvedValueOnce({ status: "saved", location: "melbourne-city" });
  try {
    const result = await POST(new Request("https://example.com/api/cron/calendar-weather", { method: "POST", headers: { authorization: "Bearer test-weather-secret" } }));
    expect(result.status).toBe(503);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(await result.json()).toEqual({ ok: false, captures: [{ location: "brisbane-city", status: "unavailable" }, { location: "melbourne-city", status: "saved" }] });
  } finally { errorLog.mockRestore(); }
});
