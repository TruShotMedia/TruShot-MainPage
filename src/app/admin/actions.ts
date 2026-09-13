"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeAuthenticatedPath } from "@/lib/auth-redirect";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { slugify } from "@/lib/format";
import { getInvoiceRelationChanges } from "@/lib/invoice-relations";
import { runNotionSync } from "@/lib/notion/sync";
import { nextTaskPosition } from "@/lib/task-position";
import { getAdminContext } from "@/lib/data/admin";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";

type AdminContext = NonNullable<Awaited<ReturnType<typeof getAdminContext>>>;

const recordIdsSchema = z.array(z.string().uuid()).min(1).max(250).transform((ids) => [...new Set(ids)]);
const optionalRecordIdsSchema = z.array(z.string().uuid()).max(250).transform((ids) => [...new Set(ids)]);
const optionalTimeSchema = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]);

async function getNextTaskPosition(context: AdminContext, statusId: string) {
  const { data, error } = await context.supabase
    .from("website-job-tasks")
    .select("position")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("status_id", statusId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return nextTaskPosition(data?.[0]?.position);
}

async function requireTaskStatus(context: AdminContext, statusId: string) {
  const { data, error } = await context.supabase
    .from("website-task-statuses")
    .select("id,key")
    .eq("id", statusId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("is_active", true)
    .single();
  if (error || !data) throw new Error("That task status is no longer available.");
  return data;
}

async function requireJobStatus(context: AdminContext, statusId: string) {
  const { data, error } = await context.supabase
    .from("website-job-statuses")
    .select("id")
    .eq("id", statusId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("is_active", true)
    .single();
  if (error || !data) throw new Error("That job status is no longer available.");
  return data;
}

async function requireClient(context: AdminContext, clientId: string) {
  if (!clientId) return;
  const { data, error } = await context.supabase
    .from("website-clients")
    .select("id")
    .eq("id", clientId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .single();
  if (error || !data) throw new Error("That client is no longer available.");
}

async function requirePublishedPricingPackage(context: AdminContext, packageId: string) {
  if (!packageId) return;
  const { data: pricingPackage, error: packageError } = await context.supabase
    .from("website-pricing-packages")
    .select("id,version_id")
    .eq("id", packageId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("is_active", true)
    .single();
  if (packageError || !pricingPackage) throw new Error("That package is no longer available.");

  const { data: version, error: versionError } = await context.supabase
    .from("website-pricing-versions")
    .select("id")
    .eq("id", pricingPackage.version_id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("status", "published")
    .single();
  if (versionError || !version) throw new Error("That package is no longer published.");
}

async function requireJob(context: AdminContext, jobId: string) {
  const { data, error } = await context.supabase
    .from("website-jobs")
    .select("id")
    .eq("id", jobId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .single();
  if (error || !data) throw new Error("That job is no longer available.");
}

async function requireInvoices(context: AdminContext, invoiceIds: string[]) {
  if (!invoiceIds.length) return;
  const { data, error } = await context.supabase
    .from("website-invoices")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .in("id", invoiceIds);
  if (error || data?.length !== invoiceIds.length) throw new Error("One or more invoices are no longer available.");
}

async function syncJobInvoiceRelations(context: AdminContext, jobId: string, invoiceIds: string[]) {
  const { data: existing, error: readError } = await context.supabase
    .from("website-invoice-job-allocations")
    .select("invoice_id,is_locked")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("job_id", jobId);
  if (readError) throw new Error(readError.message);

  const changes = getInvoiceRelationChanges(existing ?? [], invoiceIds);
  if (changes.lockedRemovals.length) throw new Error("A locked invoice allocation cannot be removed from this job.");

  if (changes.additions.length) {
    const { error: addError } = await context.supabase
      .from("website-invoice-job-allocations")
      .upsert(changes.additions.map((invoiceId) => ({
        workspace_id: TRUSHOT_WORKSPACE_ID,
        invoice_id: invoiceId,
        job_id: jobId,
        allocated_cents: 0,
      })), { onConflict: "invoice_id,job_id", ignoreDuplicates: true });
    if (addError) throw new Error(addError.message);
  }

  if (changes.removals.length) {
    const { data: removed, error: removeError } = await context.supabase
      .from("website-invoice-job-allocations")
      .delete()
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("job_id", jobId)
      .in("invoice_id", changes.removals)
      .select("invoice_id");
    if (removeError || removed?.length !== changes.removals.length) {
      throw new Error(removeError?.message ?? "The invoice relation could not be removed.");
    }
  }
}

export async function signIn(formData: FormData) {
  const email = z.email().safeParse(formData.get("email"));
  const password = z.string().min(6).safeParse(formData.get("password"));
  const destination = safeAuthenticatedPath(z.string().safeParse(formData.get("next")).data);
  const failureUrl = (error: string) => `/admin/login?${new URLSearchParams({ error, next: destination })}`;
  if (!email.success || !password.success) redirect(failureUrl("invalid"));

  const supabase = await createSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  if (error) redirect(failureUrl("credentials"));
  revalidatePath("/admin", "layout");
  revalidatePath("/tablet");
  redirect(destination);
}

export async function signOut() {
  const supabase = await createSupabaseClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function createClient(formData: FormData) {
  const input = z.object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().email().or(z.literal("")),
    phone: z.string().trim().max(40),
    industry: z.string().trim().max(120),
    package_id: z.string().uuid().or(z.literal("")).optional().default(""),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await requirePublishedPricingPackage(context, input.package_id);
  const baseSlug = slugify(input.name);
  const { data: client, error } = await context.supabase.from("website-clients").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    name: input.name,
    slug: `${baseSlug}-${Date.now().toString(36).slice(-4)}`,
    industry: input.industry || null,
    package_id: input.package_id || null,
    created_by: context.claims.sub,
    updated_by: context.claims.sub,
  }).select("id").single();
  if (error || !client) throw new Error(error?.message ?? "Client could not be created");
  if (input.email || input.phone) {
    await context.supabase.from("website-client-contacts").insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      client_id: client.id,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      is_primary: true,
    });
  }
  revalidatePath("/admin/clients");
  revalidatePath("/admin/overview");
}

export async function updateClient(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    contact_id: z.string().uuid().or(z.literal("")),
    name: z.string().trim().min(2).max(160),
    status: z.enum(["lead", "active", "paused", "inactive"]),
    industry: z.string().trim().max(120),
    website_url: z.string().trim().url().or(z.literal("")),
    priority: z.enum(["low", "standard", "high", "vip"]),
    monthly_budget_dollars: z.string(),
    package_id: z.string().uuid().or(z.literal("")),
    is_retainer: z.string().optional(),
    notes: z.string().trim().max(2_000),
    contact_name: z.string().trim().max(160),
    contact_email: z.string().trim().email().or(z.literal("")),
    contact_phone: z.string().trim().max(40),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const budgetDollars = input.monthly_budget_dollars.trim();
  const budgetCents = budgetDollars === "" ? null : Math.round(Number(budgetDollars) * 100);
  if (budgetCents !== null && (!Number.isFinite(budgetCents) || budgetCents < 0)) throw new Error("Monthly budget is not valid.");
  await requirePublishedPricingPackage(context, input.package_id);

  const { data: client, error } = await context.supabase
    .from("website-clients")
    .update({
      name: input.name,
      status: input.status,
      industry: input.industry || null,
      website_url: input.website_url || null,
      priority: input.priority,
      monthly_budget_cents: budgetCents,
      package_id: input.package_id || null,
      is_retainer: input.is_retainer === "on",
      notes: input.notes || null,
      updated_by: context.claims.sub,
    })
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !client) throw new Error(error?.message ?? "Client could not be updated.");

  const contactValues = {
    name: input.contact_name || input.name,
    email: input.contact_email || null,
    phone: input.contact_phone || null,
  };
  if (input.contact_id) {
    const { error: contactError } = await context.supabase
      .from("website-client-contacts")
      .update(contactValues)
      .eq("id", input.contact_id)
      .eq("client_id", input.id)
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID);
    if (contactError) throw new Error(contactError.message);
  } else if (input.contact_name || input.contact_email || input.contact_phone) {
    const { error: contactError } = await context.supabase.from("website-client-contacts").insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      client_id: input.id,
      ...contactValues,
      is_primary: true,
    });
    if (contactError) throw new Error(contactError.message);
  }
  revalidatePath("/admin/clients");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
}

export async function duplicateClient(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("id"));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const [{ data: source, error: sourceError }, { data: contacts, error: contactsError }] = await Promise.all([
    context.supabase.from("website-clients").select("name,status,industry,website_url,priority,monthly_budget_cents,package_id,is_retainer,source,notes").eq("id", clientId).eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).single(),
    context.supabase.from("website-client-contacts").select("name,email,phone,role_title,is_primary").eq("client_id", clientId).eq("workspace_id", TRUSHOT_WORKSPACE_ID),
  ]);
  if (sourceError || contactsError || !source) throw new Error(sourceError?.message ?? contactsError?.message ?? "Client could not be found.");
  const copyName = `${source.name} copy`;
  const { data: copy, error: copyError } = await context.supabase.from("website-clients").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    name: copyName,
    slug: `${slugify(copyName)}-${Date.now().toString(36).slice(-5)}`,
    status: source.status,
    industry: source.industry,
    website_url: source.website_url,
    priority: source.priority,
    monthly_budget_cents: source.monthly_budget_cents,
    package_id: source.package_id,
    is_retainer: source.is_retainer,
    source: source.source,
    notes: source.notes,
    created_by: context.claims.sub,
    updated_by: context.claims.sub,
  }).select("id").single();
  if (copyError || !copy) throw new Error(copyError?.message ?? "Client could not be duplicated.");
  if (contacts?.length) {
    const { error: contactCopyError } = await context.supabase.from("website-client-contacts").insert(contacts.map((contact) => ({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      client_id: copy.id,
      ...contact,
    })));
    if (contactCopyError) throw new Error(contactCopyError.message);
  }
  revalidatePath("/admin/clients");
  revalidatePath("/admin/overview");
}

export async function archiveClient(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("id"));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase.from("website-clients").update({
    archived_at: new Date().toISOString(),
    updated_by: context.claims.sub,
  }).eq("id", clientId).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Client could not be removed.");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
}

export async function createJob(formData: FormData) {
  const input = z.object({
    title: z.string().trim().min(2).max(200),
    client_id: z.string().uuid().or(z.literal("")),
    status_id: z.string().uuid(),
    shoot_date: z.string().or(z.literal("")),
    shoot_time: optionalTimeSchema,
    due_date: z.string().or(z.literal("")),
    due_time: optionalTimeSchema,
    photos_delivered: z.coerce.number().int().min(0),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await Promise.all([requireJobStatus(context, input.status_id), requireClient(context, input.client_id)]);
  const { error } = await context.supabase.from("website-jobs").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    title: input.title,
    client_id: input.client_id || null,
    status_id: input.status_id,
    shoot_date: input.shoot_date || null,
    shoot_time: input.shoot_time || null,
    due_date: input.due_date || null,
    due_time: input.due_time || null,
    photos_delivered: input.photos_delivered,
    created_by: context.claims.sub,
    updated_by: context.claims.sub,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/calendar");
  revalidatePath("/tablet");
}

export async function updateJob(formData: FormData) {
  const invoiceIds = optionalRecordIdsSchema.parse(formData.getAll("invoice_ids"));
  const input = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(2).max(200),
    job_number: z.string().trim().max(60),
    client_id: z.string().uuid().or(z.literal("")),
    status_id: z.string().uuid(),
    shoot_date: z.string().or(z.literal("")),
    shoot_time: optionalTimeSchema,
    due_date: z.string().or(z.literal("")),
    due_time: optionalTimeSchema,
    photos_delivered: z.coerce.number().int().min(0),
    location: z.string().trim().max(300),
    description: z.string().trim().max(2_000),
    notes: z.string().trim().max(4_000),
  }).parse(Object.fromEntries(formData));
  if (input.shoot_date && input.due_date && input.due_date < input.shoot_date) throw new Error("Due date cannot be before the shoot date.");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await Promise.all([
    requireJobStatus(context, input.status_id),
    requireClient(context, input.client_id),
    requireInvoices(context, invoiceIds),
  ]);
  const { data, error } = await context.supabase.from("website-jobs").update({
    title: input.title,
    job_number: input.job_number || null,
    client_id: input.client_id || null,
    status_id: input.status_id,
    shoot_date: input.shoot_date || null,
    shoot_time: input.shoot_time || null,
    due_date: input.due_date || null,
    due_time: input.due_time || null,
    photos_delivered: input.photos_delivered,
    location: input.location || null,
    description: input.description || null,
    notes: input.notes || null,
    updated_by: context.claims.sub,
  }).eq("id", input.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Job could not be updated.");
  await syncJobInvoiceRelations(context, input.id, invoiceIds);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/clients");
  revalidatePath("/tablet");
}

export async function createTask(formData: FormData) {
  const input = z.object({
    title: z.string().trim().min(2).max(220),
    job_id: z.string().uuid(),
    status_id: z.string().uuid(),
    asset_type: z.string().trim().max(100),
    hours: z.string().or(z.literal("")),
    due_date: z.string().or(z.literal("")),
    due_time: optionalTimeSchema,
    priority: z.enum(["low", "normal", "high", "urgent"]),
    description: z.string().trim().max(2_000),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await Promise.all([requireTaskStatus(context, input.status_id), requireJob(context, input.job_id)]);
  const position = await getNextTaskPosition(context, input.status_id);
  const { error } = await context.supabase.from("website-job-tasks").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    title: input.title,
    job_id: input.job_id,
    status_id: input.status_id,
    asset_type: input.asset_type || null,
    hours: input.hours ? Number(input.hours) : null,
    due_date: input.due_date || null,
    due_time: input.due_time || null,
    priority: input.priority,
    description: input.description || null,
    created_by: context.claims.sub,
    updated_by: context.claims.sub,
    position,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/calendar");
  revalidatePath("/tablet");
}

export async function updateTask(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(2).max(220),
    job_id: z.string().uuid(),
    status_id: z.string().uuid(),
    asset_type: z.string().trim().max(100),
    hours: z.string().or(z.literal("")),
    due_date: z.string().or(z.literal("")),
    due_time: optionalTimeSchema,
    priority: z.enum(["low", "normal", "high", "urgent"]),
    description: z.string().trim().max(2_000),
  }).parse(Object.fromEntries(formData));
  const hours = input.hours === "" ? null : Number(input.hours);
  if (hours !== null && (!Number.isFinite(hours) || hours < 0)) throw new Error("Task hours are not valid.");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const [status] = await Promise.all([requireTaskStatus(context, input.status_id), requireJob(context, input.job_id)]);
  const { data, error } = await context.supabase.from("website-job-tasks").update({
    title: input.title,
    job_id: input.job_id,
    status_id: input.status_id,
    asset_type: input.asset_type || null,
    hours,
    due_date: input.due_date || null,
    due_time: input.due_time || null,
    priority: input.priority,
    description: input.description || null,
    completed_at: status.key === "posted_done" ? new Date().toISOString() : null,
    updated_by: context.claims.sub,
  }).eq("id", input.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Task could not be updated.");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/calendar");
  revalidatePath("/tablet");
}

export async function updateCalendarItem(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");

  if (raw.entity_type === "job") {
    const input = z.object({
      entity_type: z.literal("job"),
      id: z.string().uuid(),
      shoot_date: z.string().or(z.literal("")),
      shoot_time: optionalTimeSchema,
      due_date: z.string().or(z.literal("")),
      due_time: optionalTimeSchema,
    }).parse(raw);
    if (input.shoot_date && input.due_date && input.due_date < input.shoot_date) {
      throw new Error("The deadline cannot be before the shoot date.");
    }
    const { data, error } = await context.supabase
      .from("website-jobs")
      .update({
        shoot_date: input.shoot_date || null,
        shoot_time: input.shoot_time || null,
        due_date: input.due_date || null,
        due_time: input.due_time || null,
        updated_by: context.claims.sub,
      })
      .eq("id", input.id)
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "The job schedule could not be saved.");
  } else if (raw.entity_type === "task") {
    const input = z.object({
      entity_type: z.literal("task"),
      id: z.string().uuid(),
      due_date: z.string().or(z.literal("")),
      due_time: optionalTimeSchema,
      priority: z.enum(["low", "normal", "high", "urgent"]),
    }).parse(raw);
    const { data, error } = await context.supabase
      .from("website-job-tasks")
      .update({
        due_date: input.due_date || null,
        due_time: input.due_time || null,
        priority: input.priority,
        updated_by: context.claims.sub,
      })
      .eq("id", input.id)
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "The task deadline could not be saved.");
  } else {
    const input = z.object({
      entity_type: z.literal("campaign-asset"),
      id: z.string().uuid(),
      start_date: z.string().or(z.literal("")),
      start_time: optionalTimeSchema,
      due_date: z.string().or(z.literal("")),
      due_time: optionalTimeSchema,
      priority: z.enum(["low", "normal", "high", "urgent"]),
    }).parse(raw);
    if (input.start_date && input.due_date && input.due_date < input.start_date) {
      throw new Error("The deadline cannot be before the campaign asset start date.");
    }
    const { data, error } = await context.supabase
      .from("website-campaign-assets")
      .update({
        start_date: input.start_date || null,
        start_time: input.start_time || null,
        due_date: input.due_date || null,
        due_time: input.due_time || null,
        priority: input.priority,
        updated_by: context.claims.sub,
      })
      .eq("id", input.id)
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "The campaign asset schedule could not be saved.");
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/overview");
  revalidatePath("/tablet");
  return { ok: true };
}

export async function updateCalendarReminderSettings(formData: FormData) {
  const input = z.object({
    default_event_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    lead_hours: z.coerce.number().min(0.25).max(168),
  }).parse(Object.fromEntries(formData));
  const leadMinutes = Math.round(input.lead_hours * 60);
  if (leadMinutes < 15 || leadMinutes > 10_080) throw new Error("Reminder lead time must be between 15 minutes and 7 days.");

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase
    .from("website-calendar-reminder-settings")
    .update({
      enabled: formData.get("enabled") === "on",
      default_event_time: input.default_event_time,
      lead_minutes: leadMinutes,
      send_at_event_time: formData.get("send_at_event_time") === "on",
      notify_job_starts: formData.get("notify_job_starts") === "on",
      notify_job_deadlines: formData.get("notify_job_deadlines") === "on",
      notify_task_deadlines: formData.get("notify_task_deadlines") === "on",
      notify_campaign_assets: formData.get("notify_campaign_assets") === "on",
    })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("workspace_id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Calendar reminder settings could not be saved.");

  revalidatePath("/admin/calendar");
}

export async function movePipelineTask(taskId: string, statusId: string) {
  const parsed = z.object({ taskId: z.string().uuid(), statusId: z.string().uuid() }).parse({ taskId, statusId });
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  const status = await requireTaskStatus(context, parsed.statusId);
  const position = await getNextTaskPosition(context, parsed.statusId);
  const { data: task, error } = await context.supabase.from("website-job-tasks").update({
    status_id: parsed.statusId,
    position,
    completed_at: status.key === "posted_done" ? new Date().toISOString() : null,
    updated_by: context.claims.sub,
  }).eq("id", parsed.taskId).eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).select("id").single();
  if (error || !task) throw new Error(error?.message ?? "The task could not be moved.");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/calendar");
  revalidatePath("/tablet");
  return { ok: true };
}

export async function bulkUpdateJobStatus(jobIds: string[], statusId: string) {
  const parsed = z.object({ jobIds: recordIdsSchema, statusId: z.string().uuid() }).parse({ jobIds, statusId });
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  await requireJobStatus(context, parsed.statusId);

  const { data: existing, error: readError } = await context.supabase
    .from("website-jobs")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .in("id", parsed.jobIds);
  if (readError || existing?.length !== parsed.jobIds.length) throw new Error("One or more selected jobs are no longer available.");

  const { data, error } = await context.supabase
    .from("website-jobs")
    .update({ status_id: parsed.statusId, updated_by: context.claims.sub })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .in("id", parsed.jobIds)
    .select("id");
  if (error || data?.length !== parsed.jobIds.length) throw new Error(error?.message ?? "The selected jobs could not be updated.");

  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/calendar");
  revalidatePath("/tablet");
  return { ok: true, updated: data.length };
}

export async function linkJobsToInvoice(jobIds: string[], invoiceId: string) {
  const parsed = z.object({ jobIds: recordIdsSchema, invoiceId: z.string().uuid() }).parse({ jobIds, invoiceId });
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  await requireInvoices(context, [parsed.invoiceId]);

  const { data: jobs, error: readError } = await context.supabase
    .from("website-jobs")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .in("id", parsed.jobIds);
  if (readError || jobs?.length !== parsed.jobIds.length) throw new Error("One or more selected jobs are no longer available.");

  const { error } = await context.supabase
    .from("website-invoice-job-allocations")
    .upsert(parsed.jobIds.map((jobId) => ({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      invoice_id: parsed.invoiceId,
      job_id: jobId,
      allocated_cents: 0,
    })), { onConflict: "invoice_id,job_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  const { count, error: verifyError } = await context.supabase
    .from("website-invoice-job-allocations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("invoice_id", parsed.invoiceId)
    .in("job_id", parsed.jobIds);
  if (verifyError || count !== parsed.jobIds.length) throw new Error("The invoice relation could not be verified.");

  revalidatePath("/admin/jobs");
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/overview");
  return { ok: true, linked: parsed.jobIds.length };
}

export async function bulkUpdateTaskStatus(taskIds: string[], statusId: string) {
  const parsed = z.object({ taskIds: recordIdsSchema, statusId: z.string().uuid() }).parse({ taskIds, statusId });
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  const status = await requireTaskStatus(context, parsed.statusId);

  const { data: existing, error: readError } = await context.supabase
    .from("website-job-tasks")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .in("id", parsed.taskIds);
  if (readError || existing?.length !== parsed.taskIds.length) throw new Error("One or more selected assets are no longer available.");

  const { data, error } = await context.supabase
    .from("website-job-tasks")
    .update({
      status_id: parsed.statusId,
      completed_at: status.key === "posted_done" ? new Date().toISOString() : null,
      updated_by: context.claims.sub,
    })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .in("id", parsed.taskIds)
    .select("id");
  if (error || data?.length !== parsed.taskIds.length) throw new Error(error?.message ?? "The selected assets could not be updated.");

  revalidatePath("/admin/tasks");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/calendar");
  revalidatePath("/tablet");
  return { ok: true, updated: data.length };
}

export async function createInvoice(formData: FormData) {
  const input = z.object({
    invoice_number: z.string().trim().min(1).max(60),
    client_id: z.string().uuid().or(z.literal("")),
    total_dollars: z.coerce.number().min(0),
    gst_dollars: z.coerce.number().min(0),
    issue_date: z.string().min(1),
    due_date: z.string().or(z.literal("")),
    status: z.enum(["draft", "sent", "viewed", "part_paid", "paid", "overdue", "void"]),
  }).parse(Object.fromEntries(formData));
  if (input.due_date && input.due_date < input.issue_date) throw new Error("Due date cannot be before the invoice date.");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await requireClient(context, input.client_id);
  const totalCents = Math.round(input.total_dollars * 100);
  const gstCents = Math.round(input.gst_dollars * 100);
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(gstCents)) throw new Error("Invoice total is too large.");
  if (gstCents > totalCents) throw new Error("GST cannot be greater than the invoice total.");
  const { error } = await context.supabase.from("website-invoices").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    client_id: input.client_id || null,
    invoice_number: input.invoice_number,
    status: input.status,
    issue_date: input.issue_date,
    due_date: input.due_date || null,
    subtotal_cents: totalCents - gstCents,
    gst_cents: gstCents,
    total_cents: totalCents,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/overview");
}

export async function updateInvoice(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    invoice_number: z.string().trim().min(1).max(60),
    client_id: z.string().uuid().or(z.literal("")),
    total_dollars: z.coerce.number().min(0),
    gst_dollars: z.coerce.number().min(0),
    issue_date: z.string().min(1),
    due_date: z.string().or(z.literal("")),
    status: z.enum(["draft", "sent", "viewed", "part_paid", "paid", "overdue", "void"]),
    notes: z.string().trim().max(2_000),
  }).parse(Object.fromEntries(formData));
  if (input.due_date && input.due_date < input.issue_date) throw new Error("Due date cannot be before the invoice date.");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await requireClient(context, input.client_id);
  const totalCents = Math.round(input.total_dollars * 100);
  const gstCents = Math.round(input.gst_dollars * 100);
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(gstCents)) throw new Error("Invoice total is too large.");
  if (gstCents > totalCents) throw new Error("GST cannot be greater than the invoice total.");

  const { data: payments, error: paymentsError } = await context.supabase
    .from("website-payments")
    .select("amount_cents")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("invoice_id", input.id);
  if (paymentsError) throw new Error(paymentsError.message);
  const paidCents = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
  if (totalCents < paidCents) throw new Error("Invoice total cannot be lower than payments already received.");

  const { data, error } = await context.supabase
    .from("website-invoices")
    .update({
      invoice_number: input.invoice_number,
      client_id: input.client_id || null,
      total_cents: totalCents,
      subtotal_cents: totalCents - gstCents,
      gst_cents: gstCents,
      issue_date: input.issue_date,
      due_date: input.due_date || null,
      status: input.status,
      notes: input.notes || null,
    })
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Invoice could not be updated.");

  revalidatePath("/admin/invoices");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/overview");
}

export async function createExpense(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    vendor: z.string().trim().min(1).max(160),
    amount_dollars: z.coerce.number().min(0),
    incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().max(500),
    gst_credit_dollars: z.coerce.number().min(0),
    deductible_percent: z.coerce.number().min(0).max(100),
    category_id: z.string().uuid().or(z.literal("")),
    client_id: z.string().uuid().or(z.literal("")),
    job_id: z.string().uuid().or(z.literal("")),
    campaign_id: z.string().uuid().or(z.literal("")),
    receipt_path: z.string().trim().max(600),
    receipt_file_name: z.string().trim().max(255),
    receipt_mime_type: z.string().trim().max(100),
    receipt_size_bytes: z.coerce.number().int().min(0).max(20 * 1024 * 1024),
    receipt_extraction: z.string().max(8_000),
  }).parse(Object.fromEntries(formData));
  const amountCents = Math.round(input.amount_dollars * 100);
  const gstCreditCents = Math.round(input.gst_credit_dollars * 100);
  if (gstCreditCents > amountCents) throw new Error("The GST credit cannot exceed the expense amount.");
  const expectedReceiptPrefix = `${TRUSHOT_WORKSPACE_ID}/expenses/${input.id}/`;
  const hasReceipt = Boolean(input.receipt_path);
  if (hasReceipt && !input.receipt_path.startsWith(expectedReceiptPrefix)) throw new Error("That receipt path is invalid.");
  if (hasReceipt && (!input.receipt_file_name || !input.receipt_mime_type || !input.receipt_size_bytes)) throw new Error("Receipt metadata is incomplete.");
  if (!hasReceipt && (input.receipt_file_name || input.receipt_mime_type || input.receipt_size_bytes)) throw new Error("Receipt metadata is invalid.");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const [category, job, campaign] = await Promise.all([
    input.category_id ? context.supabase.from("website-expense-categories").select("id").eq("id", input.category_id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("is_active", true).maybeSingle() : null,
    input.job_id ? context.supabase.from("website-jobs").select("id,client_id").eq("id", input.job_id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).maybeSingle() : null,
    input.campaign_id ? context.supabase.from("website-campaigns").select("id,client_id").eq("id", input.campaign_id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).maybeSingle() : null,
  ]);
  if (input.category_id && (!category || category.error || !category.data)) throw new Error("That expense category is unavailable.");
  if (input.job_id && (!job || job.error || !job.data)) throw new Error("That job is unavailable.");
  if (input.campaign_id && (!campaign || campaign.error || !campaign.data)) throw new Error("That campaign is unavailable.");
  if (input.client_id) await requireClient(context, input.client_id);
  const relationClientId = input.client_id || job?.data?.client_id || campaign?.data?.client_id || null;
  let extraction: Record<string, unknown> = {};
  try { extraction = input.receipt_extraction ? JSON.parse(input.receipt_extraction) as Record<string, unknown> : {}; } catch { throw new Error("Receipt extraction data is invalid."); }
  const { error } = await context.supabase.from("website-expenses").insert({
    id: input.id,
    workspace_id: TRUSHOT_WORKSPACE_ID,
    category_id: input.category_id || null,
    client_id: relationClientId,
    job_id: input.job_id || null,
    campaign_id: input.campaign_id || null,
    vendor: input.vendor,
    description: input.description || null,
    incurred_on: input.incurred_on,
    amount_cents: amountCents,
    gst_credit_cents: gstCreditCents,
    deductible_percent: input.deductible_percent,
    receipt_path: hasReceipt ? input.receipt_path : null,
    receipt_file_name: hasReceipt ? input.receipt_file_name : null,
    receipt_mime_type: hasReceipt ? input.receipt_mime_type : null,
    receipt_size_bytes: hasReceipt ? input.receipt_size_bytes : null,
    receipt_extraction: extraction,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/reports");
  return { ok: true };
}

export async function archiveExpense(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase.from("website-expenses")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "That expense could not be archived.");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/reports");
}

export async function createMarketingSpend(formData: FormData) {
  const input = z.object({
    spend_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().trim().min(1).max(100),
    campaign: z.string().trim().max(180),
    amount_dollars: z.coerce.number().min(0).max(10_000_000),
    notes: z.string().trim().max(1000),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { error } = await context.supabase.from("website-marketing-spend").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    spend_on: input.spend_on,
    source: input.source,
    campaign: input.campaign || null,
    amount_cents: Math.round(input.amount_dollars * 100),
    notes: input.notes || null,
    created_by: context.claims.sub,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/analytics");
}

export async function createAnalyticsSavedView(formData: FormData) {
  const input = z.object({
    name: z.string().trim().min(1).max(80),
    range_days: z.coerce.number().int().min(1).max(730),
    comparison_mode: z.enum(["previous_period", "previous_year"]),
    is_default: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  if (input.is_default === "on") {
    const { error } = await context.supabase.from("website-analytics-saved-views").update({ is_default: false }).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("is_default", true);
    if (error) throw new Error(error.message);
  }
  const { error } = await context.supabase.from("website-analytics-saved-views").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    name: input.name,
    range_days: input.range_days,
    comparison_mode: input.comparison_mode,
    is_default: input.is_default === "on",
    created_by: context.claims.sub,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/analytics");
}

export async function deleteAnalyticsSavedView(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { error } = await context.supabase.from("website-analytics-saved-views").delete().eq("id", id).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/analytics");
}

export async function updateAnalyticsAlertSettings(formData: FormData) {
  const input = z.object({
    enabled: z.string().optional(),
    sensitivity_percent: z.coerce.number().int().min(10).max(200),
    minimum_visitors: z.coerce.number().int().min(1).max(10_000),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { error } = await context.supabase.from("website-analytics-alert-settings").upsert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    enabled: input.enabled === "on",
    sensitivity_percent: input.sensitivity_percent,
    minimum_visitors: input.minimum_visitors,
  }, { onConflict: "workspace_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/analytics");
}

export async function updatePricingPackage(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(2).max(100),
    summary: z.string().trim().min(10).max(500),
    price_dollars: z.coerce.number().min(0),
    price_suffix: z.string().trim().max(60),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { error } = await context.supabase.from("website-pricing-packages").update({
    title: input.title,
    summary: input.summary,
    price_cents: Math.round(input.price_dollars * 100),
    price_suffix: input.price_suffix,
  }).eq("id", input.id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/pricing");
  revalidatePath("/admin/pricing");
}

function enquiryIdFrom(formData: FormData) {
  return z.string().uuid().parse(formData.get("id"));
}

function revalidateEnquiryViews() {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/overview");
  revalidatePath("/tablet");
}

export async function markEnquiryReviewing(formData: FormData) {
  const enquiryId = enquiryIdFrom(formData);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase
    .from("website-enquiries")
    .update({ status: "reviewing", reviewed_by: context.claims.sub })
    .eq("id", enquiryId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .in("status", ["new", "reviewing"])
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "That request could not be moved into review.");
  revalidateEnquiryViews();
}

export async function updateEnquiryNotes(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    internal_notes: z.string().trim().max(2_000),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase
    .from("website-enquiries")
    .update({ internal_notes: input.internal_notes || null })
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .neq("status", "archived")
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Those request notes could not be saved.");
  revalidateEnquiryViews();
}

export async function rejectEnquiry(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    rejection_reason: z.string().trim().min(3).max(1_000),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase
    .from("website-enquiries")
    .update({
      status: "declined",
      rejection_reason: input.rejection_reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.claims.sub,
      archived_at: null,
      archived_by: null,
    })
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .in("status", ["new", "reviewing"])
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "That request could not be rejected.");
  revalidateEnquiryViews();
}

export async function archiveRejectedEnquiry(formData: FormData) {
  const enquiryId = enquiryIdFrom(formData);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase
    .from("website-enquiries")
    .update({ status: "archived", archived_at: new Date().toISOString(), archived_by: context.claims.sub })
    .eq("id", enquiryId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("status", "declined")
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "That rejected request could not be archived.");
  revalidateEnquiryViews();
}

export async function restoreArchivedEnquiry(formData: FormData) {
  const enquiryId = enquiryIdFrom(formData);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase
    .from("website-enquiries")
    .update({ status: "declined", archived_at: null, archived_by: null })
    .eq("id", enquiryId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("status", "archived")
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "That request could not be restored.");
  revalidateEnquiryViews();
}

export async function reopenEnquiry(formData: FormData) {
  const enquiryId = enquiryIdFrom(formData);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase
    .from("website-enquiries")
    .update({
      status: "reviewing",
      rejection_reason: null,
      reviewed_at: null,
      reviewed_by: context.claims.sub,
      archived_at: null,
      archived_by: null,
    })
    .eq("id", enquiryId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("status", "declined")
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "That request could not be reopened.");
  revalidateEnquiryViews();
}

export async function approveEnquiry(formData: FormData) {
  const enquiryId = enquiryIdFrom(formData);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data: enquiry, error: enquiryError } = await context.supabase
    .from("website-enquiries")
    .select("*")
    .eq("id", enquiryId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .in("status", ["new", "reviewing"])
    .maybeSingle();
  if (enquiryError || !enquiry || enquiry.converted_client_id) {
    throw new Error(enquiryError?.message ?? "That request is no longer awaiting a decision.");
  }

  const { data: client, error: clientError } = await context.supabase.from("website-clients").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    name: enquiry.business_name || enquiry.name,
    slug: `${slugify(enquiry.business_name || enquiry.name)}-${Date.now().toString(36).slice(-5)}`,
    status: "active",
    source: "website_enquiry",
    package_id: enquiry.package_id,
    notes: enquiry.message,
    created_by: context.claims.sub,
    updated_by: context.claims.sub,
  }).select("id").single();
  if (clientError || !client) throw new Error(clientError?.message ?? "The client could not be created.");

  const { error: contactError } = await context.supabase.from("website-client-contacts").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    client_id: client.id,
    name: enquiry.name,
    email: enquiry.email,
    phone: enquiry.phone,
    is_primary: true,
  });
  if (contactError) {
    await context.supabase.from("website-clients").delete().eq("id", client.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
    throw new Error(contactError.message);
  }

  const { data: approved, error: approvalError } = await context.supabase.from("website-enquiries").update({
    status: "approved",
    converted_client_id: client.id,
    rejection_reason: null,
    archived_at: null,
    archived_by: null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: context.claims.sub,
  })
    .eq("id", enquiryId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .in("status", ["new", "reviewing"])
    .select("id")
    .single();
  if (approvalError || !approved) {
    await context.supabase.from("website-clients").delete().eq("id", client.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID);
    throw new Error(approvalError?.message ?? "The request could not be approved.");
  }
  revalidateEnquiryViews();
  revalidatePath("/admin/clients");
}

export async function updateSettings(formData: FormData) {
  const input = z.object({
    business_name: z.string().trim().min(2).max(160),
    legal_name: z.string().trim().max(160),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40),
    abn: z.string().trim().max(20),
    seo_title: z.string().trim().min(20).max(70),
    seo_description: z.string().trim().min(50).max(170),
    is_gst_registered: z.string().optional(),
    estimate_basis: z.enum(["cash", "accrual"]),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const [{ error: settingsError }, { error: taxError }] = await Promise.all([
    context.supabase.from("website-settings").update({
      business_name: input.business_name,
      legal_name: input.legal_name || null,
      email: input.email,
      phone: input.phone || null,
      abn: input.abn || null,
      seo_title: input.seo_title,
      seo_description: input.seo_description,
    }).eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-tax-settings").update({
      is_gst_registered: input.is_gst_registered === "on",
      estimate_basis: input.estimate_basis,
    }).eq("workspace_id", TRUSHOT_WORKSPACE_ID),
  ]);
  if (settingsError || taxError) throw new Error(settingsError?.message ?? taxError?.message);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/reports");
  revalidatePath("/");
}

export async function syncNotionImport(force = false) {
  const result = await runNotionSync({ force });
  if (result.status === "completed") {
    revalidatePath("/admin", "layout");
    revalidatePath("/tablet");
  }
  return result;
}

export async function updateWebsiteVisibility(formData: FormData) {
  const input = z.object({ show_pricing: z.literal("on").optional() }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase
    .from("website-settings")
    .update({ show_pricing: input.show_pricing === "on" })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Website visibility could not be saved.");
  revalidatePath("/");
  revalidatePath("/admin/website");
}

const editableWebsiteKeys = [
  "service-content",
  "service-brand",
  "service-campaigns",
  "about-growth-partner",
] as const;

export async function updateWebsiteElement(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    element_key: z.enum(editableWebsiteKeys),
    eyebrow: z.string().trim().max(100),
    title: z.string().trim().min(2).max(120),
    body: z.string().trim().min(10).max(700),
    media_kind: z.enum(["none", "video", "image"]),
    media_url: z.string().trim().max(2_000),
    media_path: z.string().trim().max(500),
    media_alt: z.string().trim().max(180),
  }).parse(Object.fromEntries(formData));

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");

  const { data: existing, error: readError } = await context.supabase
    .from("website-site-elements")
    .select("element_key")
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .maybeSingle();
  if (readError || !existing || existing.element_key !== input.element_key) {
    throw new Error("Website element could not be found.");
  }

  let mediaUrl: string | null = null;
  let mediaPath: string | null = null;
  if (input.media_kind !== "none") {
    if (input.media_alt.length < 3) throw new Error("Add useful alternative text for this media.");
    const allowedExtension = input.media_kind === "video"
      ? /\.(mp4|mov|webm)$/i
      : /\.(jpe?g|png|webp|avif)$/i;
    const expectedPrefix = `${TRUSHOT_WORKSPACE_ID}/${input.element_key}/`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || !input.media_path.startsWith(expectedPrefix) || !allowedExtension.test(input.media_path)) {
      throw new Error("The uploaded media path is not valid.");
    }

    const parsedMediaUrl = new URL(input.media_url);
    const parsedSupabaseUrl = new URL(supabaseUrl);
    const expectedUrlPath = `/storage/v1/object/public/website-media/${input.media_path}`;
    if (
      parsedMediaUrl.protocol !== "https:"
      || parsedMediaUrl.hostname !== parsedSupabaseUrl.hostname
      || parsedMediaUrl.pathname !== expectedUrlPath
    ) {
      throw new Error("The uploaded media URL is not valid.");
    }
    mediaUrl = parsedMediaUrl.toString();
    mediaPath = input.media_path;
  }

  const { error } = await context.supabase
    .from("website-site-elements")
    .update({
      eyebrow: input.eyebrow || null,
      title: input.title,
      body: input.body,
      media_kind: input.media_kind,
      media_url: mediaUrl,
      media_path: mediaPath,
      media_alt: input.media_alt || null,
    })
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/admin/website");
  return { ok: true };
}

const portfolioUploadSchema = z.object({
  media_kind: z.enum(["video", "image"]),
  display_size: z.enum(["standard", "wide", "tall"]),
  public_url: z.string().trim().max(2_000),
  storage_path: z.string().trim().max(500),
  poster_url: z.string().trim().max(2_000).nullable().optional(),
  poster_path: z.string().trim().max(500).nullable().optional(),
});

function validatePortfolioUpload(input: z.infer<typeof portfolioUploadSchema>) {
  const extensionGroup = input.media_kind === "video" ? "mp4|mov|webm" : "jpe?g|png|webp|avif";
  const expectedPathPattern = new RegExp(
    `^${TRUSHOT_WORKSPACE_ID}/portfolio/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(${extensionGroup})$`,
    "i",
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !expectedPathPattern.test(input.storage_path)) {
    throw new Error("The uploaded portfolio media path is not valid.");
  }

  let parsedPublicUrl: URL;
  try {
    parsedPublicUrl = new URL(input.public_url);
  } catch {
    throw new Error("The uploaded portfolio media URL is not valid.");
  }
  const parsedSupabaseUrl = new URL(supabaseUrl);
  const expectedUrlPath = `/storage/v1/object/public/website-media/${input.storage_path}`;
  if (
    parsedPublicUrl.protocol !== "https:"
    || parsedPublicUrl.hostname !== parsedSupabaseUrl.hostname
    || parsedPublicUrl.pathname !== expectedUrlPath
  ) {
    throw new Error("The uploaded portfolio media URL is not valid.");
  }

  if (Boolean(input.poster_path) !== Boolean(input.poster_url)) {
    throw new Error("The video thumbnail is incomplete.");
  }
  if ((input.poster_path || input.poster_url) && input.media_kind !== "video") {
    throw new Error("Only videos can have portfolio thumbnails.");
  }

  let posterUrl: string | null = null;
  if (input.poster_path && input.poster_url) {
    const expectedPosterPathPattern = new RegExp(
      `^${TRUSHOT_WORKSPACE_ID}/portfolio/posters/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$`,
      "i",
    );
    if (!expectedPosterPathPattern.test(input.poster_path)) {
      throw new Error("The uploaded video thumbnail path is not valid.");
    }
    let parsedPosterUrl: URL;
    try {
      parsedPosterUrl = new URL(input.poster_url);
    } catch {
      throw new Error("The uploaded video thumbnail URL is not valid.");
    }
    const expectedPosterUrlPath = `/storage/v1/object/public/website-media/${input.poster_path}`;
    if (
      parsedPosterUrl.protocol !== "https:"
      || parsedPosterUrl.hostname !== parsedSupabaseUrl.hostname
      || parsedPosterUrl.pathname !== expectedPosterUrlPath
    ) {
      throw new Error("The uploaded video thumbnail URL is not valid.");
    }
    posterUrl = parsedPosterUrl.toString();
  }

  return {
    ...input,
    public_url: parsedPublicUrl.toString(),
    poster_url: posterUrl,
    poster_path: input.poster_path ?? null,
  };
}

const portfolioCategoryLogoSchema = z.object({
  categoryId: z.string().uuid(),
  logoUrl: z.string().trim().url().max(2_000),
  logoPath: z.string().trim().max(500),
});

const portfolioMiscLogoSchema = z.object({
  name: z.string().trim().min(1).max(100),
  logoUrl: z.string().trim().url().max(2_000),
  logoPath: z.string().trim().max(500),
});

function validatePortfolioCategoryLogo(input: z.infer<typeof portfolioCategoryLogoSchema>) {
  const expectedPathPattern = new RegExp(
    `^${TRUSHOT_WORKSPACE_ID}/portfolio/logos/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpe?g|png|webp)$`,
    "i",
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !expectedPathPattern.test(input.logoPath)) {
    throw new Error("The category logo path is not valid.");
  }

  const parsedLogoUrl = new URL(input.logoUrl);
  const parsedSupabaseUrl = new URL(supabaseUrl);
  if (
    parsedLogoUrl.protocol !== "https:"
    || parsedLogoUrl.hostname !== parsedSupabaseUrl.hostname
    || parsedLogoUrl.pathname !== `/storage/v1/object/public/website-media/${input.logoPath}`
  ) {
    throw new Error("The category logo URL is not valid.");
  }

  return { ...input, logoUrl: parsedLogoUrl.toString() };
}

function validatePortfolioMiscLogo(input: z.infer<typeof portfolioMiscLogoSchema>) {
  const expectedPathPattern = new RegExp(
    `^${TRUSHOT_WORKSPACE_ID}/portfolio/logos/misc/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpe?g|png|webp)$`,
    "i",
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !expectedPathPattern.test(input.logoPath)) {
    throw new Error("The standalone logo path is not valid.");
  }

  const parsedLogoUrl = new URL(input.logoUrl);
  const parsedSupabaseUrl = new URL(supabaseUrl);
  if (
    parsedLogoUrl.protocol !== "https:"
    || parsedLogoUrl.hostname !== parsedSupabaseUrl.hostname
    || parsedLogoUrl.pathname !== `/storage/v1/object/public/website-media/${input.logoPath}`
  ) {
    throw new Error("The standalone logo URL is not valid.");
  }

  return { ...input, logoUrl: parsedLogoUrl.toString() };
}

async function requirePortfolioCategory(context: AdminContext, categoryId: string) {
  const { data, error } = await context.supabase
    .from("website-portfolio-categories")
    .select("id,name,logo_path")
    .eq("id", categoryId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .single();
  if (error || !data) throw new Error("That portfolio category is no longer available.");
  return data;
}

export async function createPortfolioCategory(formData: FormData) {
  const input = z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(280),
  }).parse(Object.fromEntries(formData));

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");

  const baseSlug = slugify(input.name) || "portfolio-category";
  const { data: existing, error: slugError } = await context.supabase
    .from("website-portfolio-categories")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("slug", baseSlug)
    .maybeSingle();
  if (slugError) throw new Error(slugError.message);

  const { data: latest, error: positionError } = await context.supabase
    .from("website-portfolio-categories")
    .select("position")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .order("position", { ascending: false })
    .limit(1);
  if (positionError) throw new Error(positionError.message);
  const slug = existing ? `${baseSlug}-${crypto.randomUUID().slice(0, 8)}` : baseSlug;
  const position = Number(latest?.[0]?.position ?? 0) + 10;

  const { data: category, error } = await context.supabase
    .from("website-portfolio-categories")
    .insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      name: input.name,
      slug,
      description: input.description || null,
      position,
      is_published: true,
      created_by: context.claims.sub,
    })
    .select("id")
    .single();
  if (error || !category) throw new Error(error?.message ?? "The category could not be created.");

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return {
    ok: true,
    category: {
      id: category.id,
      name: input.name,
      slug,
      description: input.description || null,
      logo_url: null,
      logo_path: null,
      position,
      is_published: true,
    },
  };
}

export async function updatePortfolioCategory(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(280),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await requirePortfolioCategory(context, input.id);

  const { data, error } = await context.supabase
    .from("website-portfolio-categories")
    .update({ name: input.name, description: input.description || null })
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The category could not be updated.");

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true };
}

export async function savePortfolioCategoryLogo(inputValue: {
  categoryId: string;
  logoUrl: string;
  logoPath: string;
}) {
  const input = validatePortfolioCategoryLogo(portfolioCategoryLogoSchema.parse(inputValue));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const category = await requirePortfolioCategory(context, input.categoryId);

  const { data, error } = await context.supabase
    .from("website-portfolio-categories")
    .update({ logo_url: input.logoUrl, logo_path: input.logoPath })
    .eq("id", category.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The category logo could not be saved.");

  if (category.logo_path && category.logo_path !== input.logoPath) {
    await context.supabase.storage.from("website-media").remove([category.logo_path]);
  }
  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true, logo_url: input.logoUrl, logo_path: input.logoPath };
}

export async function removePortfolioCategoryLogo(categoryIdValue: string) {
  const categoryId = z.string().uuid().parse(categoryIdValue);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const category = await requirePortfolioCategory(context, categoryId);

  const { data, error } = await context.supabase
    .from("website-portfolio-categories")
    .update({ logo_url: null, logo_path: null })
    .eq("id", category.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The category logo could not be removed.");

  if (category.logo_path) {
    await context.supabase.storage.from("website-media").remove([category.logo_path]);
  }
  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true };
}

export async function createPortfolioMiscLogos(inputValue: {
  logos: Array<{ name: string; logoUrl: string; logoPath: string }>;
}) {
  const parsed = z.object({ logos: z.array(portfolioMiscLogoSchema).min(1).max(20) }).parse(inputValue);
  const logos = parsed.logos.map(validatePortfolioMiscLogo);
  if (new Set(logos.map((logo) => logo.logoPath)).size !== logos.length) {
    throw new Error("The upload contains duplicate logo files.");
  }

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");

  const { data: latest, error: positionError } = await context.supabase
    .from("website-portfolio-logos")
    .select("position")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .order("position", { ascending: false })
    .limit(1);
  if (positionError) throw new Error(positionError.message);
  const startingPosition = Number(latest?.[0]?.position ?? 0);

  const { data, error } = await context.supabase
    .from("website-portfolio-logos")
    .insert(logos.map((logo, index) => ({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      name: logo.name,
      logo_url: logo.logoUrl,
      logo_path: logo.logoPath,
      position: startingPosition + ((index + 1) * 10),
      is_published: true,
      created_by: context.claims.sub,
    })))
    .select("id,name,logo_url,logo_path,position,is_published");
  if (error || !data) throw new Error(error?.message ?? "The standalone logos could not be saved.");

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true, logos: data };
}

export async function deletePortfolioMiscLogo(logoIdValue: string) {
  const logoId = z.string().uuid().parse(logoIdValue);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");

  const { data: logo, error: readError } = await context.supabase
    .from("website-portfolio-logos")
    .select("id,name,logo_path")
    .eq("id", logoId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .single();
  if (readError || !logo) throw new Error("That standalone logo is no longer available.");

  const { data: removed, error } = await context.supabase
    .from("website-portfolio-logos")
    .delete()
    .eq("id", logo.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !removed) throw new Error(error?.message ?? "The standalone logo could not be removed.");

  await context.supabase.storage.from("website-media").remove([logo.logo_path]);
  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true, name: logo.name };
}

export async function createPortfolioItems(formData: FormData) {
  const input = z.object({
    category_id: z.string().uuid(),
    items: z.string().max(60_000),
  }).parse(Object.fromEntries(formData));

  let parsedItems: unknown;
  try {
    parsedItems = JSON.parse(input.items);
  } catch {
    throw new Error("The uploaded portfolio media list is not valid.");
  }
  const uploads = z.array(portfolioUploadSchema).min(1).max(20).parse(parsedItems).map(validatePortfolioUpload);
  if (new Set(uploads.map((upload) => upload.storage_path)).size !== uploads.length) {
    throw new Error("The upload contains duplicate media files.");
  }

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const category = await requirePortfolioCategory(context, input.category_id);

  const { data: latest, count, error: positionError } = await context.supabase
    .from("website-portfolio-items")
    .select("position", { count: "exact" })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("category_id", category.id)
    .order("position", { ascending: false })
    .limit(1);
  if (positionError) throw new Error(positionError.message);

  const startingPosition = Number(latest?.[0]?.position ?? 0);
  const startingIndex = count ?? 0;
  const rows = uploads.map((upload, index) => ({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    category_id: category.id,
    media_kind: upload.media_kind,
    title: null,
    caption: null,
    alt_text: `${category.name} portfolio ${upload.media_kind} ${startingIndex + index + 1}`,
    storage_path: upload.storage_path,
    public_url: upload.public_url,
    poster_url: upload.poster_url,
    poster_path: upload.poster_path,
    display_size: upload.display_size,
    position: startingPosition + ((index + 1) * 10),
    is_published: true,
    created_by: context.claims.sub,
  }));
  const { error } = await context.supabase.from("website-portfolio-items").insert(rows);
  if (error) throw new Error(error.message);

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true };
}

export async function savePortfolioVideoPoster(inputValue: {
  itemId: string;
  posterUrl: string;
  posterPath: string;
}) {
  const input = z.object({
    itemId: z.string().uuid(),
    posterUrl: z.string().trim().url().max(2_000),
    posterPath: z.string().trim().max(500),
  }).parse(inputValue);
  const expectedPosterPathPattern = new RegExp(
    `^${TRUSHOT_WORKSPACE_ID}/portfolio/posters/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$`,
    "i",
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !expectedPosterPathPattern.test(input.posterPath)) {
    throw new Error("The video thumbnail path is not valid.");
  }
  const parsedPosterUrl = new URL(input.posterUrl);
  const parsedSupabaseUrl = new URL(supabaseUrl);
  if (
    parsedPosterUrl.protocol !== "https:"
    || parsedPosterUrl.hostname !== parsedSupabaseUrl.hostname
    || parsedPosterUrl.pathname !== `/storage/v1/object/public/website-media/${input.posterPath}`
  ) {
    throw new Error("The video thumbnail URL is not valid.");
  }

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data: item, error: readError } = await context.supabase
    .from("website-portfolio-items")
    .select("id,media_kind,poster_path")
    .eq("id", input.itemId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .single();
  if (readError || !item || item.media_kind !== "video") {
    throw new Error(readError?.message ?? "That portfolio video is no longer available.");
  }

  const { data, error } = await context.supabase
    .from("website-portfolio-items")
    .update({ poster_path: input.posterPath, poster_url: parsedPosterUrl.toString() })
    .eq("id", item.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The video thumbnail could not be saved.");

  if (item.poster_path && item.poster_path !== input.posterPath) {
    await context.supabase.storage.from("website-media").remove([item.poster_path]);
  }
  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true };
}

export async function reorderPortfolioItems(categoryId: string, itemIds: string[]) {
  const input = z.object({
    categoryId: z.string().uuid(),
    itemIds: z.array(z.string().uuid()).min(1).max(500),
  }).parse({ categoryId, itemIds });
  if (new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error("The portfolio order contains duplicate media.");
  }

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await requirePortfolioCategory(context, input.categoryId);

  const { data, error } = await context.supabase.rpc("website-reorder-portfolio-items", {
    p_workspace_id: TRUSHOT_WORKSPACE_ID,
    p_category_id: input.categoryId,
    p_item_ids: input.itemIds,
  });
  if (error) throw new Error(error.message);
  if (Number(data) !== input.itemIds.length) {
    throw new Error("The complete portfolio order could not be saved.");
  }

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true, updated: input.itemIds.length };
}

export async function movePortfolioItemToCategory(inputValue: {
  itemId: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  sourceItemIds: string[];
  targetItemIds: string[];
}) {
  const input = z.object({
    itemId: z.string().uuid(),
    sourceCategoryId: z.string().uuid(),
    targetCategoryId: z.string().uuid(),
    sourceItemIds: z.array(z.string().uuid()).max(500),
    targetItemIds: z.array(z.string().uuid()).min(1).max(500),
  }).parse(inputValue);

  if (input.sourceCategoryId === input.targetCategoryId) {
    throw new Error("Choose a different portfolio category.");
  }
  if (new Set(input.sourceItemIds).size !== input.sourceItemIds.length || new Set(input.targetItemIds).size !== input.targetItemIds.length) {
    throw new Error("The portfolio move contains duplicate media.");
  }
  if (input.sourceItemIds.includes(input.itemId) || input.targetItemIds.filter((id) => id === input.itemId).length !== 1) {
    throw new Error("The moved media must appear once in its destination order.");
  }

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await Promise.all([
    requirePortfolioCategory(context, input.sourceCategoryId),
    requirePortfolioCategory(context, input.targetCategoryId),
  ]);

  const { data, error } = await context.supabase.rpc("website-move-portfolio-item", {
    p_workspace_id: TRUSHOT_WORKSPACE_ID,
    p_item_id: input.itemId,
    p_source_category_id: input.sourceCategoryId,
    p_target_category_id: input.targetCategoryId,
    p_source_item_ids: input.sourceItemIds,
    p_target_item_ids: input.targetItemIds,
  });
  if (error) throw new Error(error.message);
  const expectedUpdates = input.sourceItemIds.length + input.targetItemIds.length;
  if (Number(data) !== expectedUpdates) {
    throw new Error("The media could not be moved completely.");
  }

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true, updated: expectedUpdates };
}

export async function reorderPortfolioCategories(categoryIds: string[]) {
  const input = z.array(z.string().uuid()).min(1).max(100).parse(categoryIds);
  if (new Set(input).size !== input.length) {
    throw new Error("The portfolio category order contains duplicates.");
  }

  const context = await getAdminContext();
  if (!context) redirect("/admin/login");

  const { data, error } = await context.supabase.rpc("website-reorder-portfolio-categories", {
    p_workspace_id: TRUSHOT_WORKSPACE_ID,
    p_category_ids: input,
  });
  if (error) throw new Error(error.message);
  if (Number(data) !== input.length) {
    throw new Error("The complete portfolio category order could not be saved.");
  }

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true, updated: input.length };
}

export async function deletePortfolioCategory(id: string) {
  const categoryId = z.string().uuid().parse(id);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const category = await requirePortfolioCategory(context, categoryId);

  const { count, error: countError } = await context.supabase
    .from("website-portfolio-items")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("category_id", categoryId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) throw new Error("Remove the media in this category before deleting it.");

  const { error } = await context.supabase
    .from("website-portfolio-categories")
    .delete()
    .eq("id", categoryId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  if (error) throw new Error(error.message);

  if (category.logo_path) {
    await context.supabase.storage.from("website-media").remove([category.logo_path]);
  }

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true };
}

export async function deletePortfolioItem(id: string) {
  const portfolioId = z.string().uuid().parse(id);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");

  const { data: item, error: readError } = await context.supabase
    .from("website-portfolio-items")
    .select("id,storage_path,poster_path")
    .eq("id", portfolioId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .maybeSingle();
  if (readError || !item) throw new Error(readError?.message ?? "Portfolio item could not be found.");
  const storedPathPattern = new RegExp(
    `^${TRUSHOT_WORKSPACE_ID}/portfolio/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(mp4|mov|webm|jpe?g|png|webp|avif)$`,
    "i",
  );
  if (!storedPathPattern.test(item.storage_path)) {
    throw new Error("The stored portfolio media path is not valid.");
  }

  const pathsToRemove = [item.storage_path, item.poster_path].filter((path): path is string => Boolean(path));
  const { error: storageError } = await context.supabase.storage
    .from("website-media")
    .remove(pathsToRemove);
  if (storageError) throw new Error(storageError.message);

  const { error } = await context.supabase
    .from("website-portfolio-items")
    .delete()
    .eq("id", portfolioId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID);
  if (error) throw new Error(error.message);

  revalidatePath("/portfolio");
  revalidatePath("/admin/portfolio");
  return { ok: true };
}
