import { timingSafeEqual } from "node:crypto";
import { getDeviceHubSnapshot } from "@/lib/device-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function tokenMatches(request: Request, expected: string) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length).trim();
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET(request: Request) {
  const expectedToken = process.env.TRUSHOT_DEVICE_TOKEN;
  if (!expectedToken) {
    console.error("TRUSHOT_DEVICE_TOKEN is not configured.");
    return Response.json({ error: "Device service unavailable." }, { status: 503, headers: responseHeaders });
  }
  if (!tokenMatches(request, expectedToken)) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { ...responseHeaders, "WWW-Authenticate": "Bearer" },
    });
  }

  try {
    return Response.json(await getDeviceHubSnapshot(), { headers: responseHeaders });
  } catch (error) {
    console.error("TruShot device snapshot failed.", error);
    return Response.json({ error: "Device data could not be loaded." }, { status: 500, headers: responseHeaders });
  }
}
