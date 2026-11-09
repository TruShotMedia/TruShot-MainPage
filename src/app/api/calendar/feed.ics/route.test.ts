import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/calendar-subscription/service", () => ({ readSubscription: mocks.read }));
import { GET } from "./route";
beforeEach(() => vi.clearAllMocks());
const request = (etag?: string) => new Request("https://www.trushotmedia.com/api/calendar/feed.ics?key=private-key", { headers: etag ? { "if-none-match": etag } : {} });
it("serves calendar content without cookies but never permits shared caching", async () => {
  mocks.read.mockResolvedValue({ body: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", etag: '"stable"' });
  const response = await GET(request()); expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/calendar");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
  expect(await response.text()).not.toContain("private-key");
});
it("revalidates the token before sending 304, so revoked links cannot reuse a cached feed", async () => {
  mocks.read.mockResolvedValue({ body: "calendar", etag: '"stable"' });
  expect((await GET(request('"stable"'))).status).toBe(304);
  mocks.read.mockResolvedValue(null);
  expect((await GET(request('"stable"'))).status).toBe(404); expect(mocks.read).toHaveBeenCalledTimes(2);
});
it("uses a retryable failure rather than an empty calendar on database errors", async () => {
  mocks.read.mockRejectedValue(new Error("SECRET-CALENDAR-DATA"));
  const response = await GET(request()); expect(response.status).toBe(503); expect(response.headers.get("retry-after")).toBe("900");
  expect(await response.text()).not.toContain("SECRET");
});
