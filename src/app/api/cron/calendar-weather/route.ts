import { timingSafeEqual } from "node:crypto";
import { captureCalendarWeather } from "@/lib/calendar-weather-server";
import { WEATHER_LOCATIONS } from "@/lib/calendar-weather";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const expected = Buffer.from(secret ?? "");
  const supplied = Buffer.from(authorization?.slice("Bearer ".length) ?? "");
  if (!secret || !authorization?.startsWith("Bearer ") || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const locations = Object.values(WEATHER_LOCATIONS);
  const results = await Promise.allSettled(locations.map(location => captureCalendarWeather(now, location.key)));
  const failed = results.some(result => result.status === "rejected");
  const captures = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    console.error(`${locations[index].label} weekly weather capture failed.`, result.reason);
    return { location: locations[index].key, status: "unavailable" };
  });
  return Response.json({ ok: !failed, captures }, { status: failed ? 503 : 200 });
}
