import { timingSafeEqual } from "node:crypto";
import { ACTIVE_CLIENT_REQUEST_STATUSES } from "@/lib/client-requests";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";

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
  const expectedToken = process.env.SCRIPTABLE_WIDGET_TOKEN;
  if (!expectedToken) {
    console.error("SCRIPTABLE_WIDGET_TOKEN is not configured.");
    return Response.json({ error: "Widget service unavailable." }, { status: 503, headers: responseHeaders });
  }
  if (!tokenMatches(request, expectedToken)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { ...responseHeaders, "WWW-Authenticate": "Bearer" } },
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    console.error("The Supabase service client is not configured for the Scriptable widget.");
    return Response.json({ error: "Widget service unavailable." }, { status: 503, headers: responseHeaders });
  }

  try {
    const [inboxResult, jobsResult, openStatusesResult] = await Promise.all([
      supabase
        .from("website-enquiries")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
        .in("status", [...ACTIVE_CLIENT_REQUEST_STATUSES])
        .is("archived_at", null),
      supabase
        .from("website-job-metrics")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
        .gt("open_tasks", 0),
      supabase
        .from("website-task-statuses")
        .select("id")
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
        .eq("is_active", true)
        .eq("is_open", true),
    ]);

    const firstError = inboxResult.error ?? jobsResult.error ?? openStatusesResult.error;
    if (firstError) throw firstError;
    const openStatusIds = (openStatusesResult.data ?? []).map((status) => status.id);
    let tasksOutstanding = 0;
    if (openStatusIds.length) {
      const tasksResult = await supabase
        .from("website-job-tasks")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
        .in("status_id", openStatusIds)
        .is("archived_at", null);
      if (tasksResult.error) throw tasksResult.error;
      tasksOutstanding = tasksResult.count ?? 0;
    }

    return Response.json({
      inbox: inboxResult.count ?? 0,
      jobsOutstanding: jobsResult.count ?? 0,
      tasksOutstanding,
      updatedAt: new Date().toISOString(),
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Scriptable widget summary failed.", error);
    return Response.json({ error: "Widget data could not be loaded." }, { status: 500, headers: responseHeaders });
  }
}
