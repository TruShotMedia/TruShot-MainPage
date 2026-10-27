import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { z } from "zod";
import { getAdminContext } from "@/lib/data/admin";
import { WEATHER_LOCATION } from "@/lib/calendar-weather";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const start = z.iso.date().safeParse(params.get("start"));
  const end = z.iso.date().safeParse(params.get("end"));
  if (!start.success || !end.success || end.data < start.data || differenceInCalendarDays(parseISO(end.data), parseISO(start.data)) > 62) return Response.json({ error: "Choose a calendar period of up to 63 days." }, { status: 400, headers });
  const { data, error } = await context.supabase.from("website-weather-snapshots")
    .select("week_start,captured_at,forecast_issued_at,capture_kind,days")
    .eq("workspace_id", context.membership.workspace_id)
    .eq("location_key", WEATHER_LOCATION.key)
    .gte("week_start", format(addDays(parseISO(start.data), -6), "yyyy-MM-dd"))
    .lte("week_start", end.data)
    .order("week_start");
  if (error) {
    console.error("Saved calendar weather could not be loaded.", error);
    return Response.json({ error: "Saved weather is temporarily unavailable." }, { status: 503, headers });
  }
  return Response.json({ snapshots: data ?? [], location: WEATHER_LOCATION.name }, { headers });
}
