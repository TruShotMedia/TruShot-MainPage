import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const capture = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "already-saved", weekStart: "2026-10-26" }));
vi.mock("@/lib/calendar-weather-server", () => ({ captureBrisbaneWeather: capture }));
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
  expect(await result.json()).toMatchObject({ ok: true, status: "already-saved" });
});
