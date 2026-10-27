import { timingSafeEqual } from "node:crypto";
import { captureBrisbaneWeather } from "@/lib/calendar-weather-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const expected = Buffer.from(secret ?? "");
  const supplied = Buffer.from(authorization?.slice("Bearer ".length) ?? "");
  if (!secret || !authorization?.startsWith("Bearer ") || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...await captureBrisbaneWeather() });
  } catch (error) {
    console.error("Brisbane weekly weather capture failed.", error);
    return Response.json({ error: "The weekly forecast could not be saved. Existing history is unchanged." }, { status: 503 });
  }
}
