import "server-only";

import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";
import { queryNotionSource, NotionApiError } from "@/lib/notion/client";
import { getNotionConfiguration } from "@/lib/notion/config";
import {
  joinNotionNotes,
  notionClientPriority,
  notionClientStatus,
  notionJobNumber,
  notionJobStatusKey,
  notionMatchKey,
  notionPriority,
  notionTaskStatusKey,
  safeNotionDateWindow,
  uniqueNotionClientSlug,
} from "@/lib/notion/mapping";
import {
  notionBoolean,
  notionDate,
  notionLinks,
  notionMultiSelect,
  notionNumber,
  notionRelations,
  notionSelect,
  notionText,
  notionTitle,
} from "@/lib/notion/properties";
import type { NotionPage, NotionSyncResult } from "@/lib/notion/types";

type AdminContext = NonNullable<Awaited<ReturnType<typeof getAdminContext>>>;
type ExistingClient = { id: string; name: string; slug: string; archived_at: string | null };
type ExistingJob = { id: string; title: string; client_id: string | null; shoot_date: string | null; due_date: string | null; archived_at: string | null };
type ExistingTask = { id: string; title: string; job_id: string; due_date: string | null; status_id: string; position: number; archived_at: string | null };
type NotionLink = { notion_page_id: string; entity_type: "client" | "job" | "task"; entity_id: string };

const emptyCounts = () => ({ clients: 0, jobs: 0, tasks: 0 });

function safeTitle(value: string, fallback: string, maximumLength: number) {
  const title = value.trim().slice(0, maximumLength);
  return title.length >= 2 ? title : fallback;
}

function stableNotionLinks(page: NotionPage) {
  return notionLinks(page, ["Files / Links"])
    .filter((url) => !url.includes("prod-files-secure") && !url.includes("amazonaws.com"));
}

function syncErrorMessage(error: unknown) {
  if (error instanceof NotionApiError) {
    if (error.status === 401) return "Notion rejected the integration token. Replace the token in Vercel and redeploy.";
    if (error.status === 403) return "The Notion connection needs Read content access.";
    if (error.status === 404) return "A configured Notion database is not shared with the connection, or its ID is incorrect.";
    if (error.status === 429) return "Notion is temporarily rate limiting the sync. It will retry on a later page load.";
  }
  return (error instanceof Error ? error.message : "The Notion sync failed.").slice(0, 500);
}

function findMatchingClient(page: NotionPage, clients: ExistingClient[], claimedIds: Set<string>) {
  const titleKey = notionMatchKey(notionTitle(page, ["Client Name"]));
  return clients.find((client) => !client.archived_at && !claimedIds.has(client.id) && notionMatchKey(client.name) === titleKey) ?? null;
}

function findMatchingJob(page: NotionPage, clientId: string | null, jobs: ExistingJob[], claimedIds: Set<string>) {
  const titleKey = notionMatchKey(notionTitle(page, ["Job Name"]));
  const shootDate = notionDate(page, ["Shoot Date"]);
  const dueDate = notionDate(page, ["Due Date"]);
  return jobs
    .filter((job) => !job.archived_at && !claimedIds.has(job.id) && notionMatchKey(job.title) === titleKey)
    .sort((left, right) => {
      const score = (job: ExistingJob) => Number(Boolean(clientId && job.client_id === clientId)) * 4
        + Number(Boolean(shootDate && job.shoot_date === shootDate)) * 2
        + Number(Boolean(dueDate && job.due_date === dueDate));
      return score(right) - score(left) || left.id.localeCompare(right.id);
    })[0] ?? null;
}

function findMatchingTask(page: NotionPage, jobId: string, tasks: ExistingTask[], claimedIds: Set<string>) {
  const titleKey = notionMatchKey(notionTitle(page, ["Task Name"]));
  const dueDate = notionDate(page, ["Due Date"]);
  return tasks
    .filter((task) => !task.archived_at && task.job_id === jobId && !claimedIds.has(task.id) && notionMatchKey(task.title) === titleKey)
    .sort((left, right) => Number(Boolean(dueDate && right.due_date === dueDate)) - Number(Boolean(dueDate && left.due_date === dueDate)) || left.id.localeCompare(right.id))[0] ?? null;
}

async function insertNotionLinks(context: AdminContext, links: Array<{
  notion_page_id: string;
  entity_type: "client" | "job" | "task";
  entity_id: string;
  notion_last_edited_at: string;
  metadata: Record<string, string>;
}>) {
  if (!links.length) return;
  const { error } = await context.supabase.from("website-notion-links").insert(links.map((link) => ({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    ...link,
  })));
  if (error) throw new Error(error.message);
}

function resultMessage(result: Pick<NotionSyncResult, "created" | "linked">) {
  const created = result.created.clients + result.created.jobs + result.created.tasks;
  const linked = result.linked.clients + result.linked.jobs + result.linked.tasks;
  if (!created && !linked) return "Notion is up to date—no missing CRM records were found.";
  const parts = [];
  if (created) parts.push(`${created} new ${created === 1 ? "record" : "records"} imported`);
  if (linked) parts.push(`${linked} existing ${linked === 1 ? "record" : "records"} linked`);
  return `${parts.join(" and ")}.`;
}

async function importNotionPages(
  context: AdminContext,
  clientPages: NotionPage[],
  jobPages: NotionPage[],
  taskPages: NotionPage[],
  hasClientSource: boolean,
) {
  const [jobStatusesResult, taskStatusesResult, clientsResult, jobsResult, tasksResult, linksResult] = await Promise.all([
    context.supabase.from("website-job-statuses").select("id,key").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("is_active", true),
    context.supabase.from("website-task-statuses").select("id,key").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("is_active", true),
    context.supabase.from("website-clients").select("id,name,slug,archived_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-jobs").select("id,title,client_id,shoot_date,due_date,archived_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-job-tasks").select("id,title,job_id,due_date,status_id,position,archived_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-notion-links").select("notion_page_id,entity_type,entity_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
  ]);
  const databaseError = [jobStatusesResult, taskStatusesResult, clientsResult, jobsResult, tasksResult, linksResult].find((result) => result.error)?.error;
  if (databaseError) throw new Error(databaseError.message);

  const jobStatusIds = new Map((jobStatusesResult.data ?? []).map((status) => [status.key, status.id]));
  const taskStatusIds = new Map((taskStatusesResult.data ?? []).map((status) => [status.key, status.id]));
  const planningStatusId = jobStatusIds.get("planning");
  const notStartedStatusId = taskStatusIds.get("not_started");
  if (!planningStatusId || !notStartedStatusId) throw new Error("The CRM workflow statuses are incomplete.");

  const clients = (clientsResult.data ?? []) as ExistingClient[];
  const jobs = (jobsResult.data ?? []) as ExistingJob[];
  const tasks = (tasksResult.data ?? []) as ExistingTask[];
  const links = (linksResult.data ?? []) as NotionLink[];
  const linkByPageId = new Map(links.map((link) => [link.notion_page_id, link]));
  const activeClientIds = new Set(clients.filter((client) => !client.archived_at).map((client) => client.id));
  const activeJobIds = new Set(jobs.filter((job) => !job.archived_at).map((job) => job.id));
  const claimedClientIds = new Set(links.filter((link) => link.entity_type === "client").map((link) => link.entity_id));
  const claimedJobIds = new Set(links.filter((link) => link.entity_type === "job").map((link) => link.entity_id));
  const claimedTaskIds = new Set(links.filter((link) => link.entity_type === "task").map((link) => link.entity_id));
  const usedClientSlugs = new Set(clients.map((client) => client.slug));
  const created = emptyCounts();
  const linked = emptyCounts();
  const warnings: string[] = [];

  const clientPageById = new Map(clientPages.map((page) => [page.id, page]));
  const referencedClientPageIds = new Set(hasClientSource
    ? jobPages.flatMap((page) => notionRelations(page, ["Client"]))
    : []);
  const clientIdByNotionPage = new Map<string, string>();
  const pendingClientLinks: Array<{ page: NotionPage; entityId: string; matchedExisting: boolean }> = [];
  const newClientRows: Array<{ page: NotionPage; row: Record<string, unknown>; slug: string }> = [];

  for (const pageId of referencedClientPageIds) {
    const existingLink = linkByPageId.get(pageId);
    if (existingLink?.entity_type === "client") {
      if (activeClientIds.has(existingLink.entity_id)) clientIdByNotionPage.set(pageId, existingLink.entity_id);
      else warnings.push(`A Notion client relation points to an archived CRM client (${pageId}).`);
      continue;
    }
    const page = clientPageById.get(pageId);
    if (!page) {
      warnings.push(`A job references a Notion client that was not returned by the Clients data source (${pageId}).`);
      continue;
    }
    const match = findMatchingClient(page, clients, claimedClientIds);
    if (match) {
      claimedClientIds.add(match.id);
      clientIdByNotionPage.set(page.id, match.id);
      pendingClientLinks.push({ page, entityId: match.id, matchedExisting: true });
      continue;
    }

    const name = safeTitle(notionTitle(page, ["Client Name"]), `Notion client ${page.id.slice(-6)}`, 180);
    const slug = uniqueNotionClientSlug(name, page.id, usedClientSlugs);
    const budget = notionNumber(page, ["Budget"]);
    const contentTypes = notionMultiSelect(page, ["Content Type"]);
    newClientRows.push({
      page,
      slug,
      row: {
        workspace_id: TRUSHOT_WORKSPACE_ID,
        name,
        slug,
        status: notionClientStatus(notionSelect(page, ["Status"])),
        industry: notionText(page, ["Industry"]) || null,
        priority: notionClientPriority(notionSelect(page, ["Priority"])),
        monthly_budget_cents: budget == null ? null : Math.max(0, Math.round(budget * 100)),
        is_retainer: notionBoolean(page, ["Retainer"]),
        source: "Notion",
        notes: contentTypes.length ? `Content types: ${contentTypes.join(", ")}` : null,
        created_by: context.claims.sub,
        updated_by: context.claims.sub,
      },
    });
  }

  if (newClientRows.length) {
    const { data, error } = await context.supabase.from("website-clients").insert(newClientRows.map((item) => item.row)).select("id,slug");
    if (error) throw new Error(error.message);
    const createdBySlug = new Map((data ?? []).map((client) => [client.slug, client.id]));
    for (const item of newClientRows) {
      const entityId = createdBySlug.get(item.slug);
      if (!entityId) throw new Error("A Notion client was created without a returned ID.");
      created.clients += 1;
      activeClientIds.add(entityId);
      claimedClientIds.add(entityId);
      clientIdByNotionPage.set(item.page.id, entityId);
      pendingClientLinks.push({ page: item.page, entityId, matchedExisting: false });
    }
  }
  await insertNotionLinks(context, pendingClientLinks.map(({ page, entityId }) => ({
    notion_page_id: page.id,
    entity_type: "client",
    entity_id: entityId,
    notion_last_edited_at: page.last_edited_time,
    metadata: { notion_url: page.url, title: notionTitle(page, ["Client Name"]) },
  })));
  linked.clients += pendingClientLinks.filter((item) => item.matchedExisting).length;

  const jobIdByNotionPage = new Map<string, string>();
  const pendingJobLinks: Array<{ page: NotionPage; entityId: string; matchedExisting: boolean }> = [];
  const newJobRows: Array<{ page: NotionPage; row: Record<string, unknown>; jobNumber: string }> = [];

  for (const page of jobPages) {
    const existingLink = linkByPageId.get(page.id);
    if (existingLink?.entity_type === "job") {
      if (activeJobIds.has(existingLink.entity_id)) jobIdByNotionPage.set(page.id, existingLink.entity_id);
      continue;
    }
    const clientRelations = hasClientSource ? notionRelations(page, ["Client"]) : [];
    const clientId = clientRelations.length ? clientIdByNotionPage.get(clientRelations[0]) ?? null : null;
    const match = findMatchingJob(page, clientId, jobs, claimedJobIds);
    if (match) {
      claimedJobIds.add(match.id);
      activeJobIds.add(match.id);
      jobIdByNotionPage.set(page.id, match.id);
      pendingJobLinks.push({ page, entityId: match.id, matchedExisting: true });
      continue;
    }

    const title = safeTitle(notionTitle(page, ["Job Name"]), `Untitled Notion job ${page.id.slice(-6)}`, 200);
    const { shootDate, dueDate } = safeNotionDateWindow(notionDate(page, ["Shoot Date"]), notionDate(page, ["Due Date"]));
    if (notionDate(page, ["Shoot Date"]) && notionDate(page, ["Due Date"]) && !dueDate) warnings.push(`${title}: due date was before the shoot date and was not imported.`);
    const extraClientNames = clientRelations.slice(1).flatMap((relationId) => {
      const relatedPage = clientPageById.get(relationId);
      return relatedPage ? [notionTitle(relatedPage, ["Client Name"])] : [];
    });
    const sourceLinks = stableNotionLinks(page);
    const jobNumber = notionJobNumber(page.id);
    newJobRows.push({
      page,
      jobNumber,
      row: {
        workspace_id: TRUSHOT_WORKSPACE_ID,
        client_id: clientId,
        status_id: jobStatusIds.get(notionJobStatusKey(notionSelect(page, ["Status"]))) ?? planningStatusId,
        title,
        job_number: jobNumber,
        shoot_date: shootDate,
        due_date: dueDate,
        location: notionText(page, ["Location"]) || null,
        photos_delivered: Math.max(0, Math.round(notionNumber(page, ["#photos"]) ?? 0)),
        notes: joinNotionNotes([
          notionText(page, ["Notes"]),
          sourceLinks.length ? `Files / links:\n${sourceLinks.join("\n")}` : null,
          extraClientNames.length ? `Additional Notion clients: ${extraClientNames.join(", ")}` : null,
          `Imported from Notion: ${page.url}`,
        ], 4_000),
        created_by: context.claims.sub,
        updated_by: context.claims.sub,
      },
    });
  }

  if (newJobRows.length) {
    const { data, error } = await context.supabase.from("website-jobs").insert(newJobRows.map((item) => item.row)).select("id,job_number");
    if (error) throw new Error(error.message);
    const createdByNumber = new Map((data ?? []).map((job) => [job.job_number, job.id]));
    for (const item of newJobRows) {
      const entityId = createdByNumber.get(item.jobNumber);
      if (!entityId) throw new Error("A Notion job was created without a returned ID.");
      created.jobs += 1;
      activeJobIds.add(entityId);
      claimedJobIds.add(entityId);
      jobIdByNotionPage.set(item.page.id, entityId);
      pendingJobLinks.push({ page: item.page, entityId, matchedExisting: false });
    }
  }
  await insertNotionLinks(context, pendingJobLinks.map(({ page, entityId }) => ({
    notion_page_id: page.id,
    entity_type: "job",
    entity_id: entityId,
    notion_last_edited_at: page.last_edited_time,
    metadata: { notion_url: page.url, title: notionTitle(page, ["Job Name"]) },
  })));
  linked.jobs += pendingJobLinks.filter((item) => item.matchedExisting).length;

  const unlinkedTaskPages = taskPages.filter((page) => !linkByPageId.has(page.id));
  const needsUnassignedJob = unlinkedTaskPages.some((page) => notionRelations(page, ["Job"]).length === 0);
  let unassignedJobId = jobs.find((job) => !job.archived_at && notionMatchKey(job.title) === notionMatchKey("Unassigned Notion imports"))?.id ?? null;
  if (needsUnassignedJob && !unassignedJobId) {
    const { data, error } = await context.supabase.from("website-jobs").insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      status_id: planningStatusId,
      title: "Unassigned Notion imports",
      job_number: null,
      notes: "Tasks created in Notion without a Job relation are collected here for review.",
      created_by: context.claims.sub,
      updated_by: context.claims.sub,
    }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "The unassigned Notion job could not be created.");
    unassignedJobId = data.id;
    activeJobIds.add(data.id);
    created.jobs += 1;
  }

  const maxPositionByStatus = new Map<string, number>();
  for (const task of tasks) maxPositionByStatus.set(task.status_id, Math.max(maxPositionByStatus.get(task.status_id) ?? 0, Number(task.position)));
  const pendingTaskLinks: Array<{ page: NotionPage; entityId: string; matchedExisting: boolean }> = [];
  const newTaskRows: Array<{ page: NotionPage; row: Record<string, unknown> }> = [];
  let unresolvedTasks = 0;

  for (const page of unlinkedTaskPages) {
    const jobRelations = notionRelations(page, ["Job"]);
    const jobId = jobRelations.length ? jobIdByNotionPage.get(jobRelations[0]) ?? null : unassignedJobId;
    if (!jobId || !activeJobIds.has(jobId)) {
      unresolvedTasks += 1;
      warnings.push(`${safeTitle(notionTitle(page, ["Task Name"]), "Untitled task", 220)}: its related Notion job could not be resolved.`);
      continue;
    }
    const match = findMatchingTask(page, jobId, tasks, claimedTaskIds);
    if (match) {
      claimedTaskIds.add(match.id);
      pendingTaskLinks.push({ page, entityId: match.id, matchedExisting: true });
      continue;
    }

    const title = safeTitle(notionTitle(page, ["Task Name"]), `Untitled Notion task ${page.id.slice(-6)}`, 220);
    const statusKey = notionTaskStatusKey(notionSelect(page, ["Status"]));
    const statusId = taskStatusIds.get(statusKey) ?? notStartedStatusId;
    const position = (maxPositionByStatus.get(statusId) ?? 0) + 1_000;
    maxPositionByStatus.set(statusId, position);
    const sourceLinks = stableNotionLinks(page);
    const shootDate = notionDate(page, ["Shoot Date"]);
    const effort = notionSelect(page, ["Effort Level"]);
    newTaskRows.push({
      page,
      row: {
        workspace_id: TRUSHOT_WORKSPACE_ID,
        job_id: jobId,
        status_id: statusId,
        title,
        description: joinNotionNotes([
          notionText(page, ["Description"]),
          notionText(page, ["Notes"]),
          effort ? `Effort: ${effort}` : null,
          shootDate ? `Shoot date: ${shootDate}` : null,
          sourceLinks.length ? `Files / links:\n${sourceLinks.join("\n")}` : null,
        ], 2_000),
        asset_type: notionSelect(page, ["Captured By"]) || null,
        priority: notionPriority(notionSelect(page, ["Priority"])),
        hours: notionNumber(page, ["Hours"]),
        due_date: notionDate(page, ["Due Date"]),
        completed_at: statusKey === "posted_done" ? new Date().toISOString() : null,
        position,
        external_url: page.url,
        created_by: context.claims.sub,
        updated_by: context.claims.sub,
      },
    });
  }

  if (newTaskRows.length) {
    const { data, error } = await context.supabase.from("website-job-tasks").insert(newTaskRows.map((item) => item.row)).select("id,external_url");
    if (error) throw new Error(error.message);
    const createdByUrl = new Map((data ?? []).map((task) => [task.external_url, task.id]));
    for (const item of newTaskRows) {
      const entityId = createdByUrl.get(item.page.url);
      if (!entityId) throw new Error("A Notion task was created without a returned ID.");
      created.tasks += 1;
      claimedTaskIds.add(entityId);
      pendingTaskLinks.push({ page: item.page, entityId, matchedExisting: false });
    }
  }
  await insertNotionLinks(context, pendingTaskLinks.map(({ page, entityId }) => ({
    notion_page_id: page.id,
    entity_type: "task",
    entity_id: entityId,
    notion_last_edited_at: page.last_edited_time,
    metadata: { notion_url: page.url, title: notionTitle(page, ["Task Name"]) },
  })));
  linked.tasks += pendingTaskLinks.filter((item) => item.matchedExisting).length;

  return { created, linked, unresolvedTasks, warnings: warnings.slice(0, 30) };
}

export async function runNotionSync({ force = false }: { force?: boolean } = {}): Promise<NotionSyncResult> {
  const configuration = getNotionConfiguration();
  if (!configuration) return {
    status: "not_configured",
    scanned: emptyCounts(),
    created: emptyCounts(),
    linked: emptyCounts(),
    unresolvedTasks: 0,
    warnings: [],
    message: "Add the Notion token plus the Jobs and Tasks data source IDs in Vercel to enable automatic imports.",
  };

  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired.");
  const { data: claimed, error: claimError } = await context.supabase.rpc("website-claim-notion-sync", {
    p_workspace_id: TRUSHOT_WORKSPACE_ID,
    p_force: force,
  });
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return {
    status: "skipped",
    scanned: emptyCounts(),
    created: emptyCounts(),
    linked: emptyCounts(),
    unresolvedTasks: 0,
    warnings: [],
    message: "Notion was checked recently or another sync is already running.",
  };

  const { data: importRun } = await context.supabase.from("website-import-runs").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    source_name: "notion-api",
    status: "running",
    created_by: context.claims.sub,
  }).select("id").single();

  try {
    const [clientPages, jobPages, taskPages] = await Promise.all([
      configuration.clientsSourceId
        ? queryNotionSource(configuration.token, configuration.clientsSourceId)
        : Promise.resolve<NotionPage[]>([]),
      queryNotionSource(configuration.token, configuration.jobsSourceId),
      queryNotionSource(configuration.token, configuration.tasksSourceId),
    ]);
    const imported = await importNotionPages(context, clientPages, jobPages, taskPages, Boolean(configuration.clientsSourceId));
    const completedAt = new Date();
    const scanned = { clients: clientPages.length, jobs: jobPages.length, tasks: taskPages.length };
    const result: NotionSyncResult = {
      status: "completed",
      scanned,
      ...imported,
      message: resultMessage(imported),
    };
    const nextSyncAt = new Date(completedAt.getTime() + configuration.syncIntervalMinutes * 60_000).toISOString();
    const { error: stateError } = await context.supabase.from("website-notion-sync-state").update({
      status: "completed",
      last_completed_at: completedAt.toISOString(),
      last_successful_at: completedAt.toISOString(),
      next_sync_at: nextSyncAt,
      lock_until: null,
      last_error: null,
      last_result: result,
    }).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
    if (stateError) throw new Error(stateError.message);
    if (importRun?.id) await context.supabase.from("website-import-runs").update({
      status: "completed",
      row_counts: { scanned, created: result.created, linked: result.linked },
      reconciliation: { unresolved_tasks: result.unresolvedTasks, warnings: result.warnings },
      completed_at: completedAt.toISOString(),
    }).eq("id", importRun.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
    const createdTotal = result.created.clients + result.created.jobs + result.created.tasks;
    if (createdTotal) await context.supabase.from("website-notifications").insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      type: "notion_import",
      title: "Notion import completed",
      body: result.message,
    });
    return result;
  } catch (error) {
    const message = syncErrorMessage(error);
    const completedAt = new Date();
    const retryAt = new Date(completedAt.getTime() + 5 * 60_000).toISOString();
    await context.supabase.from("website-notion-sync-state").update({
      status: "failed",
      last_completed_at: completedAt.toISOString(),
      next_sync_at: retryAt,
      lock_until: null,
      last_error: message,
      last_result: {},
    }).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
    if (importRun?.id) await context.supabase.from("website-import-runs").update({
      status: "failed",
      errors: [message],
      completed_at: completedAt.toISOString(),
    }).eq("id", importRun.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
    return {
      status: "failed",
      scanned: emptyCounts(),
      created: emptyCounts(),
      linked: emptyCounts(),
      unresolvedTasks: 0,
      warnings: [],
      message,
    };
  }
}
