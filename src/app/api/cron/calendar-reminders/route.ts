import { timingSafeEqual } from "node:crypto";
import { dispatchCalendarReminders } from "@/lib/calendar-reminders";
import { dispatchClickUpCalendarEventSync } from "@/lib/clickup/calendar-event-sync";
import { dispatchClickUpJobSync } from "@/lib/clickup/job-sync";
import { reconcileClickUpJobs } from "@/lib/clickup/inbound-sync";
import { dispatchIngreignReminders } from "@/lib/ingreign-reminders";

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
    const clickUpSync = (async () => {
      const inbound = await reconcileClickUpJobs();
      const [jobs, events] = await Promise.all([
        dispatchClickUpJobSync({ limit: 50 }),
        dispatchClickUpCalendarEventSync({ limit: 50 }),
      ]);
      return { inbound, outbound: { jobs, events } };
    })().catch((error) => {
      console.error("ClickUp sync failed without interrupting calendar reminders.", error);
      return {
        status: "unavailable" as const,
        message: "ClickUp could not be reached during this reminder run.",
      };
    });
    const [calendar, ingreign, clickup] = await Promise.all([
      dispatchCalendarReminders(),
      dispatchIngreignReminders(),
      clickUpSync,
    ]);
    return Response.json({ ok: true, calendar, ingreign, clickup });
  } catch (error) {
    console.error("Calendar reminder dispatch failed.", error);
    return Response.json({ error: "Calendar reminders could not be processed." }, { status: 500 });
  }
}
