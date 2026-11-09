import { describe, expect, it, vi } from "vitest";
import { fetchOutlookFeed, MAX_FEED_BYTES, validateOutlookFeedUrl } from "./feed";
const url = "https://outlook.office365.com/owa/calendar/private-token/calendar.ics";
const body = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
describe("private Outlook fetch boundary", () => {
  it("allows Outlook ICS links and normalizes webcal", () => {
    expect(validateOutlookFeedUrl(url)).toBe(url);
    expect(validateOutlookFeedUrl(url.replace("https:", "webcal:"))).toBe(url);
  });
  it.each(["http://outlook.office365.com/owa/calendar/a/calendar.ics", "https://outlook.office365.com.attacker.com/owa/calendar/a/calendar.ics", "https://127.0.0.1/calendar.ics", "https://outlook.office365.com:444/owa/calendar/a/calendar.ics", "https://user:pass@outlook.office365.com/owa/calendar/a/calendar.ics", "https://outlook.office365.com/owa/calendar/a/calendar.html", "https://outlook.office365.com/owa/calendar/a/calendar.ics#token"]) ("rejects unsafe or non-feed URL %s", value => { expect(() => validateOutlookFeedUrl(value)).toThrow(); });
  it("never follows a redirect to another host", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
    await expect(fetchOutlookFeed(url, {}, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "manual" });
  });
  it("uses validators and avoids parsing a 304", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    expect(await fetchOutlookFeed(url, { etag: '"v1"' }, fetcher)).toEqual({ unchanged: true });
    expect(fetcher.mock.calls[0][1].headers["If-None-Match"]).toBe('"v1"');
  });
  it("rejects HTML/login responses and oversized decoded bodies", async () => {
    await expect(fetchOutlookFeed(url, {}, vi.fn().mockResolvedValue(new Response("<html>Login</html>")))).rejects.toThrow("did not return a calendar");
    await expect(fetchOutlookFeed(url, {}, vi.fn().mockResolvedValue(new Response("x".repeat(MAX_FEED_BYTES + 1))))).rejects.toThrow("too large");
  });
  it("returns calendar data but never raw server error text or the secret URL", async () => {
    const parsed = await fetchOutlookFeed(url, {}, vi.fn().mockResolvedValue(new Response(body, { headers: { etag: "v2" } })));
    expect(parsed).toMatchObject({ unchanged: false, body, etag: "v2" });
    await expect(fetchOutlookFeed(url, {}, vi.fn().mockRejectedValue(new Error(`network error ${url}`)))).rejects.toThrow("Outlook could not be reached");
    await expect(fetchOutlookFeed(url, {}, vi.fn().mockResolvedValue(new Response(`private ${url}`, { status: 403 })))).rejects.not.toThrow("private-token");
  });
});
