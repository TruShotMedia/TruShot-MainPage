"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProductionContext } from "@/lib/data/admin";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { CALENDAR_DAY_MINUTES, CALENDAR_TIME_STEP, shiftedCalendarEventDates, shiftedCalendarEventTimes, type CalendarEventMoveResult } from "@/lib/calendar-event";
import { scheduleClickUpCalendarEventSync } from "@/lib/clickup/calendar-event-sync";

const moveInput = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  from: z.iso.date(),
  to: z.iso.date(),
  startMinute: z.int().min(0).lt(CALENDAR_DAY_MINUTES).multipleOf(CALENDAR_TIME_STEP).optional(),
});

export async function moveProductionCalendarEvent(input: unknown): Promise<CalendarEventMoveResult> {
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid day or time for this event." };
  const { id, expectedUpdatedAt, from, to, startMinute } = parsed.data;
  const retiming = startMinute !== undefined;
  const context = await getProductionContext();
  if (!context || context.membership.workspace_id !== TRUSHOT_WORKSPACE_ID)
    return { ok: false, error: "Sign in again before moving this event." };
  // Only persisted CRM events are in this table. Imported Outlook events,
  // job deadlines and flights cannot be moved through this action.
  const eventRow = () => context.supabase.from("website-calendar-events");
  const { data: event, error: readError } = await eventRow()
    .select("start_date,end_date,start_time,end_time,is_all_day,updated_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("id", id).eq("updated_at", expectedUpdatedAt).maybeSingle();
  const stale = { ok: false, error: "This event changed or is no longer available. Refresh the calendar and try again." } as const;
  if (readError) return { ok: false, error: "Couldn’t load this event. Try again." };
  if (!event) return stale;
  const dates = shiftedCalendarEventDates(event.start_date, event.end_date, from, to);
  if (!dates) return { ok: false, error: "Choose a day within the event and drag it to a valid date." };
  const datePatch = from === to ? {} : dates;
  let changes: { start_date?: string; end_date?: string; start_time?: string; end_time?: string };
  if (retiming) {
    const shifted = shiftedCalendarEventTimes(event, from, startMinute);
    if (!shifted) return { ok: false, error: "Time dragging is only for timed events that fit within one day." };
    if (shifted.unchanged && from === to) {
      const { start_date, end_date, updated_at, start_time, end_time } = event;
      return { ok: true, dates: { start_date, end_date, updated_at, start_time, end_time } };
    }
    // Week drops can change both fields together; never save one without the other.
    changes = { ...datePatch, ...shifted.times };
  } else {
    if (from === to) return { ok: true, dates: { start_date: event.start_date, end_date: event.end_date, updated_at: event.updated_at } };
    changes = datePatch;
  }
  // Both reads and writes use the caller’s RLS-bound client. The timestamp
  // guard also prevents overwriting an edit that arrived during this move.
  const { data: moved, error: writeError } = await eventRow()
    .update({ ...changes, updated_by: context.claims.sub }).eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("id", id).eq("updated_at", expectedUpdatedAt)
    .select("start_date,end_date,start_time,end_time,updated_at").maybeSingle();
  if (writeError) return { ok: false, error: "Couldn’t move this event. Its schedule was not changed." };
  if (!moved) return stale;
  for (const path of ["/autopacific", "/autopacific/mobile", "/marketing", "/tablet", "/admin/calendar"])
    revalidatePath(path);
  scheduleClickUpCalendarEventSync();
  return { ok: true, dates: retiming ? moved : { start_date: moved.start_date, end_date: moved.end_date, updated_at: moved.updated_at } };
}
