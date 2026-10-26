import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getTabletKioskData, getAdminContext } from "@/lib/data/admin";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { scopeTabletKioskDataByClient } from "@/lib/tablet-client-scope";
import type { PipelineTask, TabletJobRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTOPACIFIC_CLIENT_NAME = "Autopacific Group";
const responseHeaders = {
  "Cache-Control": "private, max-age=0, must-revalidate",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function versionFor(value: unknown) {
  return `\"${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}\"`;
}

function notModified(request: Request, payload: unknown) {
  const eTag = versionFor(payload);
  return request.headers.get("if-none-match") === eTag
    ? new Response(null, { status: 304, headers: { ...responseHeaders, ETag: eTag } })
    : null;
}

async function getAutopacificClient() {
  const context = await getAdminContext();
  if (!context) return null;
  const { data: client, error } = await context.supabase
    .from("website-clients")
    .select("id,name")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("name", AUTOPACIFIC_CLIENT_NAME)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !client) throw new Error("AutoPacific Group is unavailable.");
  return { client, context };
}

function clientOptions(client: { id: string; name: string }) {
  return [{ id: client.id, name: client.name }];
}

async function jobsPayload() {
  const authenticated = await getAutopacificClient();
  if (!authenticated) return null;
  const { client, context } = authenticated;
  const [jobsResult, statusesResult, taskStatusesResult] = await Promise.all([
    context.supabase
      .from("website-jobs")
      .select("id,title,job_number,client_id,status_id,shoot_date,shoot_time,due_date,due_time,photos_delivered,location,delivery_url,description,notes,delivered_at,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("client_id", client.id)
      .is("archived_at", null),
    context.supabase
      .from("website-job-statuses")
      .select("id,key,label,color,position,is_closed,is_active")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("is_active", true)
      .order("position"),
    context.supabase
      .from("website-task-statuses")
      .select("id,is_open")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("is_active", true),
  ]);
  const firstError = jobsResult.error ?? statusesResult.error ?? taskStatusesResult.error;
  if (firstError) throw firstError;
  const jobs = jobsResult.data ?? [];
  const jobIds = jobs.map((job) => job.id);
  const { data: tasks, error: taskError } = jobIds.length
    ? await context.supabase
      .from("website-job-tasks")
      .select("id,job_id,status_id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .in("job_id", jobIds)
      .is("archived_at", null)
    : { data: [], error: null };
  if (taskError) throw taskError;
  const { data: recordNotes, error: noteError } = jobIds.length
    ? await context.supabase
      .from("website-work-record-notes")
      .select("id,job_id,body,created_at,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("record_kind", "job")
      .in("job_id", jobIds)
      .order("created_at")
    : { data: [], error: null };
  if (noteError) throw noteError;
  const taskStatusById = new Map((taskStatusesResult.data ?? []).map((status) => [status.id, status]));
  const jobStatusById = new Map((statusesResult.data ?? []).map((status) => [status.id, status]));
  const notesByJobId = new Map<string, Array<{ id: string; body: string; created_at: string; updated_at: string }>>();
  for (const note of recordNotes ?? []) {
    if (!note.job_id) continue;
    notesByJobId.set(note.job_id, [...(notesByJobId.get(note.job_id) ?? []), {
      id: note.id,
      body: note.body,
      created_at: note.created_at,
      updated_at: note.updated_at,
    }]);
  }
  const pipelineJobs: TabletJobRecord[] = jobs.map((job) => {
    const relatedTasks = (tasks ?? []).filter((task) => task.job_id === job.id);
    return {
      ...job,
      client,
      status: jobStatusById.get(job.status_id) ?? null,
      record_notes: notesByJobId.get(job.id) ?? [],
      total_tasks: relatedTasks.length,
      open_tasks: relatedTasks.filter((task) => taskStatusById.get(task.status_id)?.is_open ?? true).length,
    };
  });
  return {
    kind: "jobs" as const,
    clientOptions: clientOptions(client),
    jobOptions: jobs.map((job) => ({ id: job.id, name: job.title, jobNumber: job.job_number, clientName: client.name, dueDate: job.due_date })).sort((left, right) => left.name.localeCompare(right.name)),
    jobStatuses: (statusesResult.data ?? []).map((status) => ({ id: status.id, key: status.key, label: status.label, color: status.color, position: status.position, is_closed: status.is_closed })),
    pipelineJobs,
  };
}

async function tasksPayload() {
  const authenticated = await getAutopacificClient();
  if (!authenticated) return null;
  const { client, context } = authenticated;
  const [jobsResult, statusesResult] = await Promise.all([
    context.supabase
      .from("website-jobs")
      .select("id,title,job_number,client_id,due_date")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("client_id", client.id)
      .is("archived_at", null),
    context.supabase
      .from("website-task-statuses")
      .select("id,key,label,color,position,is_open,is_active")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("is_active", true)
      .order("position"),
  ]);
  const firstError = jobsResult.error ?? statusesResult.error;
  if (firstError) throw firstError;
  const jobs = jobsResult.data ?? [];
  const jobIds = jobs.map((job) => job.id);
  const { data: tasks, error: taskError } = jobIds.length
    ? await context.supabase
      .from("website-job-tasks")
      .select("id,title,job_id,status_id,asset_type,hours,due_date,due_time,priority,description,position,completed_at,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .in("job_id", jobIds)
      .is("archived_at", null)
      .order("position")
    : { data: [], error: null };
  if (taskError) throw taskError;
  const taskIds = (tasks ?? []).map((task) => task.id);
  const { data: recordNotes, error: noteError } = taskIds.length
    ? await context.supabase
      .from("website-work-record-notes")
      .select("id,task_id,body,created_at,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("record_kind", "task")
      .in("task_id", taskIds)
      .order("created_at")
    : { data: [], error: null };
  if (noteError) throw noteError;
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const notesByTaskId = new Map<string, Array<{ id: string; body: string; created_at: string; updated_at: string }>>();
  for (const note of recordNotes ?? []) {
    if (!note.task_id) continue;
    notesByTaskId.set(note.task_id, [...(notesByTaskId.get(note.task_id) ?? []), {
      id: note.id,
      body: note.body,
      created_at: note.created_at,
      updated_at: note.updated_at,
    }]);
  }
  const pipelineTasks: PipelineTask[] = (tasks ?? []).map((task) => {
    const job = jobById.get(task.job_id);
    return {
      ...task,
      asset_type: task.asset_type === "Other" ? "Other" : "Asset",
      due_date: job?.due_date ?? null,
      record_notes: notesByTaskId.get(task.id) ?? [],
      job: job ? { id: job.id, title: job.title, client } : null,
    };
  });
  return {
    kind: "tasks" as const,
    clientOptions: clientOptions(client),
    jobOptions: jobs.map((job) => ({ id: job.id, name: job.title, jobNumber: job.job_number, clientName: client.name, dueDate: job.due_date })).sort((left, right) => left.name.localeCompare(right.name)),
    pipelineTasks,
    statuses: (statusesResult.data ?? []).map((status) => ({ id: status.id, key: status.key, label: status.label, color: status.color, position: status.position, is_open: status.is_open })),
  };
}

async function schedulePayload() {
  const data = scopeTabletKioskDataByClient(
    await getTabletKioskData({ clientName: AUTOPACIFIC_CLIENT_NAME, includeOtherCalendarItems: true }),
    AUTOPACIFIC_CLIENT_NAME,
    { includeOtherCalendarItems: true },
  );
  return {
    kind: "schedule" as const,
    calendarCampaignAssets: data.calendarCampaignAssets,
    calendarEvents: data.calendarEvents,
    calendarJobs: data.calendarJobs,
    calendarTasks: data.calendarTasks,
    flightEvents: data.flightEvents,
  };
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("view");
  if (requested !== "jobs" && requested !== "tasks" && requested !== "schedule") {
    return NextResponse.json({ error: "Unknown workspace tab." }, { status: 400, headers: responseHeaders });
  }
  try {
    const payload = requested === "jobs" ? await jobsPayload() : requested === "tasks" ? await tasksPayload() : await schedulePayload();
    if (!payload) return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: responseHeaders });
    const cached = notModified(request, payload);
    if (cached) return cached;
    return NextResponse.json(payload, { headers: { ...responseHeaders, ETag: versionFor(payload) } });
  } catch (error) {
    console.error("AutoPacific tab refresh failed.", error);
    return NextResponse.json({ error: "This workspace tab could not be refreshed." }, { status: 503, headers: responseHeaders });
  }
}
