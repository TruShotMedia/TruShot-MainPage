import { readSubscription } from "@/lib/calendar-subscription/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
export async function GET(request: Request) {
  // No cookie session required: Outlook authenticates with this revocable,
  // 256-bit bearer credential. Never log the request URL or reflect the key.
  const key = new URL(request.url).searchParams.get("key") ?? "";
  try {
    const feed = await readSubscription(key);
    if (!feed) return new Response("Calendar not found.", { status: 404, headers });
    const responseHeaders = { ...headers, ETag: feed.etag, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="autopacific-calendar.ics"' };
    // Revalidate permission/token first, even for conditional requests. No CDN
    // or process cache is allowed to serve a revoked calendar.
    if (request.headers.get("if-none-match")?.split(",").map(value => value.trim()).includes(feed.etag)) return new Response(null, { status: 304, headers: responseHeaders });
    return new Response(feed.body, { headers: responseHeaders });
  } catch { return new Response("Calendar temporarily unavailable. Please try again later.", { status: 503, headers: { ...headers, "Retry-After": "900" } }); }
}
