import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*", "/autopacific/:path*", "/marketing/:path*", "/tablet/:path*", "/ingreign/:path*", "/lifestyle/:path*"],
};
