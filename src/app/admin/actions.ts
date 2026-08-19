"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { slugify } from "@/lib/format";
import { nextTaskPosition } from "@/lib/task-position";
import { getAdminContext } from "@/lib/data/admin";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";

type AdminContext = NonNullable<Awaited<ReturnType<typeof getAdminContext>>>;

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

export async function signIn(formData: FormData) {
  const email = z.email().safeParse(formData.get("email"));
  const password = z.string().min(6).safeParse(formData.get("password"));
  if (!email.success || !password.success) redirect("/admin/login?error=invalid");

  const supabase = await createSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  if (error) redirect("/admin/login?error=credentials");
  revalidatePath("/admin", "layout");
  redirect("/admin/overview");
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
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const baseSlug = slugify(input.name);
  const { data: client, error } = await context.supabase.from("website-clients").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    name: input.name,
    slug: `${baseSlug}-${Date.now().toString(36).slice(-4)}`,
    industry: input.industry || null,
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

  const { data: client, error } = await context.supabase
    .from("website-clients")
    .update({
      name: input.name,
      status: input.status,
      industry: input.industry || null,
      website_url: input.website_url || null,
      priority: input.priority,
      monthly_budget_cents: budgetCents,
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
    context.supabase.from("website-clients").select("name,status,industry,website_url,priority,monthly_budget_cents,is_retainer,source,notes").eq("id", clientId).eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).single(),
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
    due_date: z.string().or(z.literal("")),
    photos_delivered: z.coerce.number().int().min(0),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { error } = await context.supabase.from("website-jobs").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    title: input.title,
    client_id: input.client_id || null,
    status_id: input.status_id,
    shoot_date: input.shoot_date || null,
    due_date: input.due_date || null,
    photos_delivered: input.photos_delivered,
    created_by: context.claims.sub,
    updated_by: context.claims.sub,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
}

export async function updateJob(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(2).max(200),
    job_number: z.string().trim().max(60),
    client_id: z.string().uuid().or(z.literal("")),
    status_id: z.string().uuid(),
    shoot_date: z.string().or(z.literal("")),
    due_date: z.string().or(z.literal("")),
    photos_delivered: z.coerce.number().int().min(0),
    location: z.string().trim().max(300),
    description: z.string().trim().max(2_000),
    notes: z.string().trim().max(4_000),
  }).parse(Object.fromEntries(formData));
  if (input.shoot_date && input.due_date && input.due_date < input.shoot_date) throw new Error("Due date cannot be before the shoot date.");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase.from("website-jobs").update({
    title: input.title,
    job_number: input.job_number || null,
    client_id: input.client_id || null,
    status_id: input.status_id,
    shoot_date: input.shoot_date || null,
    due_date: input.due_date || null,
    photos_delivered: input.photos_delivered,
    location: input.location || null,
    description: input.description || null,
    notes: input.notes || null,
    updated_by: context.claims.sub,
  }).eq("id", input.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Job could not be updated.");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/overview");
}

export async function createTask(formData: FormData) {
  const input = z.object({
    title: z.string().trim().min(2).max(220),
    job_id: z.string().uuid(),
    status_id: z.string().uuid(),
    asset_type: z.string().trim().max(100),
    hours: z.string().or(z.literal("")),
    due_date: z.string().or(z.literal("")),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    description: z.string().trim().max(2_000),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const position = await getNextTaskPosition(context, input.status_id);
  const { error } = await context.supabase.from("website-job-tasks").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    title: input.title,
    job_id: input.job_id,
    status_id: input.status_id,
    asset_type: input.asset_type || null,
    hours: input.hours ? Number(input.hours) : null,
    due_date: input.due_date || null,
    priority: input.priority,
    description: input.description || null,
    created_by: context.claims.sub,
    updated_by: context.claims.sub,
    position,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/jobs");
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
    priority: z.enum(["low", "normal", "high", "urgent"]),
    description: z.string().trim().max(2_000),
  }).parse(Object.fromEntries(formData));
  const hours = input.hours === "" ? null : Number(input.hours);
  if (hours !== null && (!Number.isFinite(hours) || hours < 0)) throw new Error("Task hours are not valid.");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data, error } = await context.supabase.from("website-job-tasks").update({
    title: input.title,
    job_id: input.job_id,
    status_id: input.status_id,
    asset_type: input.asset_type || null,
    hours,
    due_date: input.due_date || null,
    priority: input.priority,
    description: input.description || null,
    updated_by: context.claims.sub,
  }).eq("id", input.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Task could not be updated.");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
}

export async function movePipelineTask(taskId: string, statusId: string) {
  const parsed = z.object({ taskId: z.string().uuid(), statusId: z.string().uuid() }).parse({ taskId, statusId });
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  const { data: status, error: statusError } = await context.supabase
    .from("website-task-statuses")
    .select("id")
    .eq("id", parsed.statusId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("is_active", true)
    .single();
  if (statusError || !status) throw new Error("That pipeline stage is no longer available.");
  const position = await getNextTaskPosition(context, parsed.statusId);
  const { data: task, error } = await context.supabase.from("website-job-tasks").update({
    status_id: parsed.statusId,
    position,
    updated_by: context.claims.sub,
  }).eq("id", parsed.taskId).eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).select("id").single();
  if (error || !task) throw new Error(error?.message ?? "The task could not be moved.");
  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/overview");
  return { ok: true };
}

export async function createInvoice(formData: FormData) {
  const input = z.object({
    invoice_number: z.string().trim().min(1).max(60),
    client_id: z.string().uuid().or(z.literal("")),
    total_dollars: z.coerce.number().min(0),
    issue_date: z.string().min(1),
    due_date: z.string().or(z.literal("")),
    status: z.enum(["draft", "sent", "viewed", "part_paid", "paid", "overdue", "void"]),
  }).parse(Object.fromEntries(formData));
  if (input.due_date && input.due_date < input.issue_date) throw new Error("Due date cannot be before the invoice date.");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const totalCents = Math.round(input.total_dollars * 100);
  const { error } = await context.supabase.from("website-invoices").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    client_id: input.client_id || null,
    invoice_number: input.invoice_number,
    status: input.status,
    issue_date: input.issue_date,
    due_date: input.due_date || null,
    subtotal_cents: totalCents,
    gst_cents: 0,
    total_cents: totalCents,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/finance");
}

export async function createExpense(formData: FormData) {
  const input = z.object({
    vendor: z.string().trim().min(1).max(160),
    amount_dollars: z.coerce.number().min(0),
    incurred_on: z.string().min(1),
    description: z.string().trim().max(500),
    gst_credit_dollars: z.coerce.number().min(0),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { error } = await context.supabase.from("website-expenses").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    vendor: input.vendor,
    description: input.description || null,
    incurred_on: input.incurred_on,
    amount_cents: Math.round(input.amount_dollars * 100),
    gst_credit_cents: Math.round(input.gst_credit_dollars * 100),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/finance");
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
  revalidatePath("/admin/pricing");
}

export async function approveEnquiry(formData: FormData) {
  const enquiryId = z.string().uuid().parse(formData.get("id"));
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data: enquiry } = await context.supabase
    .from("website-enquiries")
    .select("*")
    .eq("id", enquiryId)
    .maybeSingle();
  if (!enquiry || enquiry.converted_client_id) return;

  const { data: client, error } = await context.supabase.from("website-clients").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    name: enquiry.business_name || enquiry.name,
    slug: `${slugify(enquiry.business_name || enquiry.name)}-${Date.now().toString(36).slice(-5)}`,
    status: "active",
    source: "website_enquiry",
    notes: enquiry.message,
    created_by: context.claims.sub,
    updated_by: context.claims.sub,
  }).select("id").single();
  if (error || !client) throw new Error(error?.message ?? "Could not approve enquiry");
  await context.supabase.from("website-client-contacts").insert({
    workspace_id: TRUSHOT_WORKSPACE_ID,
    client_id: client.id,
    name: enquiry.name,
    email: enquiry.email,
    phone: enquiry.phone,
    is_primary: true,
  });
  await context.supabase.from("website-enquiries").update({
    status: "approved",
    converted_client_id: client.id,
    reviewed_at: new Date().toISOString(),
    reviewed_by: context.claims.sub,
  }).eq("id", enquiryId);
  revalidatePath("/admin/requests");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/overview");
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
    context.supabase.from("website-tax-settings").update({ is_gst_registered: input.is_gst_registered === "on" }).eq("workspace_id", TRUSHOT_WORKSPACE_ID),
  ]);
  if (settingsError || taxError) throw new Error(settingsError?.message ?? taxError?.message);
  revalidatePath("/admin/settings");
  revalidatePath("/");
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
    .select("element_key,element_type")
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .maybeSingle();
  if (readError || !existing || existing.element_key !== input.element_key) {
    throw new Error("Website element could not be found.");
  }

  const expectedMediaKind = existing.element_type === "service" ? "video" : "image";
  if (input.media_kind !== "none" && input.media_kind !== expectedMediaKind) {
    throw new Error(`This element only accepts ${expectedMediaKind} media.`);
  }

  let mediaUrl: string | null = null;
  let mediaPath: string | null = null;
  if (input.media_kind !== "none") {
    if (input.media_alt.length < 3) throw new Error("Add useful alternative text for this media.");
    const allowedExtension = input.media_kind === "video"
      ? /\.(mp4|webm)$/i
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
