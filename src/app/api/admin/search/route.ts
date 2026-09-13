import { NextResponse } from "next/server";
import { getAdminContext, getGlobalSearchIndex } from "@/lib/data/admin";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAdminContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const items = await getGlobalSearchIndex();
  return NextResponse.json({ items }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
