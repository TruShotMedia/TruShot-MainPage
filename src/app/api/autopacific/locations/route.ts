import { NextResponse } from "next/server";
import { getProductionContext } from "@/lib/data/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { geoapifyLocation, normalizeLocationQuery } from "@/lib/job-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  const context = await getProductionContext();
  if (!context) return NextResponse.json({ error: "Sign in to search locations." }, { status: 401,headers });
  const input = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (input.length < 3 || input.length > 200) return NextResponse.json({ error: "Enter between 3 and 200 characters." }, { status: 400,headers });
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Address search isn’t connected yet. You can still enter a location or drop a pin.", code: "NOT_CONFIGURED" }, { status: 503,headers });
  try {
    const service = createServiceClient();
    if (!service) throw new Error("Search is temporarily unavailable.");
    const { data: allowed,error: quotaError } = await service.rpc("website-map-search-allow", { p_workspace_id: TRUSHOT_WORKSPACE_ID,p_user_id: context.claims.sub });
    if (quotaError) throw quotaError;
    if (!allowed) return NextResponse.json({ error: "Location search is busy. Please try again shortly." }, { status: 429,headers: { ...headers,"Retry-After": "60" } });
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.search = new URLSearchParams({ text: normalizeLocationQuery(input),format: "json",limit: "6",lang: "en",bias: "countrycode:au",apiKey }).toString();
    const response = await fetch(url, { cache: "no-store",signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Location provider unavailable");
    const payload = await response.json();
    if (!Array.isArray(payload.results)) throw new Error("Invalid location response");
    const results = payload.results.map(geoapifyLocation).filter(Boolean);
    return NextResponse.json({ results }, { headers });
  } catch {
    // Do not log the provider URL: it includes the private API key and query.
    return NextResponse.json({ error: "Location search is temporarily unavailable. Try again, or keep your typed location." }, { status: 503,headers });
  }
}
