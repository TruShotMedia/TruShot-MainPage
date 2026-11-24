import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";
import { JOB_PROGRESS_HOST, JOB_PROGRESS_ORIGIN } from "@/lib/job-progress-host";

const mock = vi.hoisted(() => ({ updateSession: vi.fn(() => new Response(null, { status: 204 })) }));
vi.mock("@/lib/supabase/proxy", () => mock);

function request(path: string, method = "GET", host = JOB_PROGRESS_HOST) {
  return new NextRequest(`https://${host}${path}`, { method, headers: { host } });
}

describe("dedicated job progress hostname", () => {
  it("matches the branded hostname at root and before sensitive and unrelated routes, not compiled assets", () => {
    const matches = (url: string, host: string) => unstable_doesMiddlewareMatch({
      config: config as Parameters<typeof unstable_doesMiddlewareMatch>[0]["config"], url, headers: { host },
    });
    for (const path of ["/", "/job-progress", "/marketing", "/api/admin/search", "/sw.js", "/_next/image"]) {
      expect(matches(path, JOB_PROGRESS_HOST)).toBe(true);
    }
    expect(matches("/job-progress", JOB_PROGRESS_HOST + ".")).toBe(true);
    expect(matches("/_next/static/chunks/app.js", JOB_PROGRESS_HOST)).toBe(false);
    expect(matches("/admin/jobs", "www.trushotmedia.com")).toBe(true);
    expect(matches("/job-progress", "www.trushotmedia.com")).toBe(false);
    expect(matches("/api/job-progress", "www.trushotmedia.com")).toBe(false);
  });

  it.each([
    ["/admin/jobs", "GET"], ["/autopacific", "GET"], ["/marketing", "GET"], ["/tablet", "GET"],
    ["/api/autopacific/jobs/demo/progress", "POST"], ["/api/calendar/feed.ics", "GET"],
    ["/sw.js", "GET"], ["/portfolio", "GET"], ["/_next/image", "GET"],
    ["/job-progress", "POST"], ["/api/job-progress", "GET"],
  ])("does not expose %s (%s) on the public host", async (path, method) => {
    const result = await proxy(request(path, method));
    expect(result.status).toBe(404);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("serves the PIN gate, unlock endpoint and dashboard artwork without starting a CRM session", async () => {
    mock.updateSession.mockClear();
    expect((await proxy(request("/"))).headers.get("location")).toBe(JOB_PROGRESS_ORIGIN + "/job-progress");
    for (const path of ["/job-progress", "/job-progress.webmanifest", "/brand/autopacific-logo-clean.png", "/autopacific/icons/192"]) {
      expect((await proxy(request(path))).headers.get("x-middleware-next")).toBe("1");
    }
    expect((await proxy(request("/api/job-progress", "POST"))).headers.get("x-middleware-next")).toBe("1");
    expect(mock.updateSession).not.toHaveBeenCalled();
    expect((await proxy(request("/autopacific", "GET", "www.trushotmedia.com"))).status).toBe(204);
  });
});
