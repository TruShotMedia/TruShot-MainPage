import "server-only";

// Restrict this connector to Microsoft's publishing endpoints. It is not a
// general URL fetch proxy. Every redirect must pass the same validation.
const microsoftHosts = new Set(["outlook.office365.com", "outlook.office.com", "outlook.live.com"]);
export const MAX_FEED_BYTES = 2 * 1024 * 1024;
export class OutlookFeedError extends Error {}
export function validateOutlookFeedUrl(input: string) {
  let url: URL;
  try { url = new URL(input.trim().replace(/^webcal:/i, "https:")); }
  catch { throw new OutlookFeedError("Enter the ICS subscription link from Outlook’s Publish a calendar settings."); }
  if (url.protocol !== "https:" || !microsoftHosts.has(url.hostname.toLowerCase()) || url.port || url.username || url.password || url.hash
    || !/^\/owa\/calendar\/.+\/calendar\.ics$/i.test(url.pathname) || input.length > 4096) {
    throw new OutlookFeedError("Use the private HTTPS ICS subscription link published by Outlook, not its HTML sharing link.");
  }
  return url.toString();
}
export async function fetchOutlookFeed(input: string, validators: { etag?: string | null; last_modified?: string | null } = {}, fetcher = fetch) {
  let url = validateOutlookFeedUrl(input);
  const signal = AbortSignal.timeout(12_000);
  for (let redirects = 0; redirects <= 2; redirects++) {
    let response: Response;
    try {
      response = await fetcher(url, { redirect: "manual", cache: "no-store", signal, headers: {
        Accept: "text/calendar", "User-Agent": "TruShot-Calendar/1.0",
        ...(validators.etag ? { "If-None-Match": validators.etag } : {}),
        ...(validators.last_modified ? { "If-Modified-Since": validators.last_modified } : {}),
      } });
    } catch { throw new OutlookFeedError("Outlook could not be reached. Your last saved events are still available."); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 2) throw new OutlookFeedError("Outlook redirected this link too many times. Please publish a fresh ICS link.");
      url = validateOutlookFeedUrl(new URL(location, url).toString());
      continue;
    }
    if (response.status === 304) return { unchanged: true as const };
    if (!response.ok) {
      await response.body?.cancel();
      throw new OutlookFeedError(response.status === 401 || response.status === 403 || response.status === 404
        ? "Outlook is no longer sharing this calendar. Check that it is still published, or reconnect with a fresh ICS link."
        : "Outlook is temporarily unavailable. Your last saved events are still available.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new OutlookFeedError("Outlook returned an empty response.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_FEED_BYTES) throw new OutlookFeedError("This calendar is too large to connect safely. Publish a smaller date range in Outlook.");
        chunks.push(part.value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (error instanceof OutlookFeedError) throw error;
      throw new OutlookFeedError("The calendar download was interrupted. Please try again.");
    }
    const body = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "").trim();
    if (!/^BEGIN:VCALENDAR\r?\n/i.test(body) || !/\r?\nEND:VCALENDAR$/i.test(body)) throw new OutlookFeedError("This link did not return a calendar. Copy the ICS link, not the HTML link, from Outlook.");
    return { unchanged: false as const, body, etag: response.headers.get("etag")?.slice(0, 500) ?? null, last_modified: response.headers.get("last-modified")?.slice(0, 100) ?? null };
  }
  throw new OutlookFeedError("The Outlook calendar could not be downloaded.");
}
