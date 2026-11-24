"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProductionContext } from "@/lib/data/admin";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { shiftedCalendarEventDates, type CalendarEventMoveResult } from "@/lib/calendar-event";
import { scheduleClickUpCalendarEventSync } from "@/lib/clickup/calendar-event-sync";

const moveInput = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  from: z.iso.date(),
  to: z.iso.date(),
});

export async function moveProductionCalendarEvent(input: unknown): Promise<CalendarEventMoveResult> {
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid day for this event." };
  const { id, expectedUpdatedAt, from, to } = parsed.data;
  const context = await getProductionContext();
  if (!context || context.membership.workspace_id !== TRUSHOT_WORKSPACE_ID)
    return { ok: false, error: "Sign in again before moving this event." };
  // Only persisted CRM events are in this table. Imported Outlook events,
  // job deadlines and flights cannot be moved through this action.
  const eventRow = () => context.supabase.from("website-calendar-events");
  const { data: event, error: readError } = await eventRow()
    .select("start_date,end_date,updated_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("id", id).eq("updated_at", expectedUpdatedAt).maybeSingle();
  const stale = { ok: false, error: "This event changed or is no longer available. Refresh the calendar and try again." } as const;
  if (readError) return { ok: false, error: "Couldn’t load this event. Try again." };
  if (!event) return stale;
  const dates = shiftedCalendarEventDates(event.start_date, event.end_date, from, to);
  if (!dates) return { ok: false, error: "Choose a day within the event and drag it to a new date." };
  if (from === to) return { ok: true, dates: event };
  // Both reads and writes use the caller’s RLS-bound client. The timestamp
  // guard also prevents overwriting an edit that arrived during this move.
  const { data: moved, error: writeError } = await eventRow()
    .update({ ...dates, updated_by: context.claims.sub }).eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("id", id).eq("updated_at", expectedUpdatedAt)
    .select("start_date,end_date,updated_at").maybeSingle();
  if (writeError) return { ok: false, error: "Couldn’t move this event. No dates were changed." };
  if (!moved) return stale;
  for (const path of ["/autopacific", "/autopacific/mobile", "/marketing", "/tablet", "/admin/calendar"])
    revalidatePath(path);
  scheduleClickUpCalendarEventSync();
  return { ok: true, dates: moved };
}
