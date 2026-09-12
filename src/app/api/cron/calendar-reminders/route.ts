import { timingSafeEqual } from "node:crypto";
import { dispatchCalendarReminders } from "@/lib/calendar-reminders";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length);
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await dispatchCalendarReminders();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Calendar reminder dispatch failed.", error);
    return Response.json({ error: "Calendar reminders could not be processed." }, { status: 500 });
  }
}
