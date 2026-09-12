"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";

const optionalUuid = z.union([z.string().uuid(), z.literal("")]);
const optionalDate = z.union([z.iso.date(), z.literal("")]);
const optionalTime = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]);
const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const campaignStatusSchema = z.enum(["planning", "active", "paused", "complete"]);
const attachmentMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/avif", "image/heic",
  "video/mp4", "video/webm", "video/quicktime", "video/mov", "video/x-quicktime",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);

type AdminContext = NonNullable<Awaited<ReturnType<typeof getAdminContext>>>;

function revalidateCampaigns() {
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin/calendar");
  revalidatePath("/tablet");
}

function validateDateWindow(startDate: string, dueDate: string, label = "deadline") {
  if (startDate && dueDate && dueDate < startDate) {
    throw new Error(`The ${label} cannot be before the start date.`);
  }
}

async function requireCampaign(context: AdminContext, campaignId: string) {
  const { data, error } = await context.supabase
    .from("website-campaigns")
    .select("id,client_id,title,status")
    .eq("id", campaignId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .single();
  if (error || !data) throw new Error("That campaign is no longer available.");
  return data;
}

async function requireCampaignAsset(context: AdminContext, assetId: string) {
  const { data, error } = await context.supabase
    .from("website-campaign-assets")
    .select("id,campaign_id,title,status_id,completed_at")
    .eq("id", assetId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .single();
  if (error || !data) throw new Error("That campaign asset is no longer available.");
  return data;
}

async function requireClient(context: AdminContext, clientId: string) {
  if (!clientId) return;
  const { data } = await context.supabase
    .from("website-clients")
    .select("id")
    .eq("id", clientId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) throw new Error("The selected client is no longer available.");
}

async function requireInvoice(context: AdminContext, invoiceId: string) {
  if (!invoiceId) return;
  const { data } = await context.supabase
    .from("website-invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) throw new Error("The selected invoice is no longer available.");
}

async function requireTaskStatus(context: AdminContext, statusId: string) {
  const { data } = await context.supabase
    .from("website-task-statuses")
    .select("id,key,is_open")
    .eq("id", statusId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) throw new Error("The selected workflow status is no longer available.");
  return data;
}

const campaignFormSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(180),
  client_id: optionalUuid,
  status: campaignStatusSchema,
  start_date: optionalDate,
  due_date: optionalDate,
  objective: z.string().trim().max(3000),
  notes: z.string().trim().max(8000),
});

export async function createCampaign(formData: FormData) {
  const input = campaignFormSchema.omit({ id: true }).parse(Object.fromEntries(formData));
  validateDateWindow(input.start_date, input.due_date);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await requireClient(context, input.client_id);

  const { data, error } = await context.supabase
    .from("website-campaigns")
    .insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      client_id: input.client_id || null,
      title: input.title,
      objective: input.objective || null,
      status: input.status,
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      notes: input.notes || null,
      created_by: context.claims.sub,
      updated_by: context.claims.sub,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The campaign could not be created.");
  revalidateCampaigns();
  return { ok: true, id: data.id };
}

export async function updateCampaign(formData: FormData) {
  const input = campaignFormSchema.required({ id: true }).parse(Object.fromEntries(formData));
  validateDateWindow(input.start_date, input.due_date);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await Promise.all([requireCampaign(context, input.id), requireClient(context, input.client_id)]);

  const { data, error } = await context.supabase
    .from("website-campaigns")
    .update({
      client_id: input.client_id || null,
      title: input.title,
      objective: input.objective || null,
      status: input.status,
      start_date: input.start_date || null,
      due_date: input.due_date || null,
      notes: input.notes || null,
      updated_by: context.claims.sub,
    })
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The campaign could not be updated.");
  revalidateCampaigns();
  return { ok: true };
}

export async function archiveCampaign(campaignIdValue: string) {
  const campaignId = z.string().uuid().parse(campaignIdValue);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await requireCampaign(context, campaignId);
  const archivedAt = new Date().toISOString();
  const { data, error } = await context.supabase
    .from("website-campaigns")
    .update({ archived_at: archivedAt, updated_by: context.claims.sub })
    .eq("id", campaignId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The campaign could not be removed.");
  await context.supabase
    .from("website-campaign-assets")
    .update({ archived_at: archivedAt, updated_by: context.claims.sub })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null);
  revalidateCampaigns();
  return { ok: true };
}

const campaignAssetFormSchema = z.object({
  id: z.string().uuid().optional(),
  campaign_id: z.string().uuid(),
  title: z.string().trim().min(2).max(220),
  status_id: z.string().uuid(),
  invoice_id: optionalUuid,
  asset_type: z.string().trim().max(100),
  priority: prioritySchema,
  start_date: optionalDate,
  start_time: optionalTime,
  due_date: optionalDate,
  due_time: optionalTime,
  location: z.string().trim().max(300),
  contact_name: z.string().trim().max(160),
  contact_email: z.union([z.email().max(254), z.literal("")]),
  contact_phone: z.string().trim().max(50),
  description: z.string().trim().max(3000),
  notes: z.string().trim().max(8000),
});

export async function createCampaignAsset(formData: FormData) {
  const input = campaignAssetFormSchema.omit({ id: true }).parse(Object.fromEntries(formData));
  validateDateWindow(input.start_date, input.due_date, "asset deadline");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const [campaign, status] = await Promise.all([
    requireCampaign(context, input.campaign_id),
    requireTaskStatus(context, input.status_id),
    requireInvoice(context, input.invoice_id),
  ]);

  const { data: latest } = await context.supabase
    .from("website-campaign-assets")
    .select("position")
    .eq("campaign_id", campaign.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .order("position", { ascending: false })
    .limit(1);
  const position = Number(latest?.[0]?.position ?? 0) + 10;
  const { data, error } = await context.supabase
    .from("website-campaign-assets")
    .insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      campaign_id: campaign.id,
      invoice_id: input.invoice_id || null,
      status_id: status.id,
      title: input.title,
      description: input.description || null,
      asset_type: input.asset_type || null,
      priority: input.priority,
      start_date: input.start_date || null,
      start_time: input.start_time || null,
      due_date: input.due_date || null,
      due_time: input.due_time || null,
      location: input.location || null,
      contact_name: input.contact_name || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      notes: input.notes || null,
      position,
      completed_at: status.key === "posted_done" ? new Date().toISOString() : null,
      created_by: context.claims.sub,
      updated_by: context.claims.sub,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The campaign asset could not be created.");
  revalidateCampaigns();
  return { ok: true, id: data.id };
}

export async function updateCampaignAsset(formData: FormData) {
  const input = campaignAssetFormSchema.required({ id: true }).parse(Object.fromEntries(formData));
  validateDateWindow(input.start_date, input.due_date, "asset deadline");
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const [asset, campaign, status] = await Promise.all([
    requireCampaignAsset(context, input.id),
    requireCampaign(context, input.campaign_id),
    requireTaskStatus(context, input.status_id),
    requireInvoice(context, input.invoice_id),
  ]);
  if (asset.campaign_id !== campaign.id) throw new Error("The asset does not belong to this campaign.");

  const { data, error } = await context.supabase
    .from("website-campaign-assets")
    .update({
      invoice_id: input.invoice_id || null,
      status_id: status.id,
      title: input.title,
      description: input.description || null,
      asset_type: input.asset_type || null,
      priority: input.priority,
      start_date: input.start_date || null,
      start_time: input.start_time || null,
      due_date: input.due_date || null,
      due_time: input.due_time || null,
      location: input.location || null,
      contact_name: input.contact_name || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      notes: input.notes || null,
      completed_at: status.key === "posted_done" ? asset.completed_at ?? new Date().toISOString() : null,
      updated_by: context.claims.sub,
    })
    .eq("id", asset.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The campaign asset could not be updated.");
  revalidateCampaigns();
  return { ok: true };
}

export async function setCampaignAssetStatus(assetIdValue: string, statusIdValue: string) {
  const { assetId, statusId } = z.object({ assetId: z.string().uuid(), statusId: z.string().uuid() })
    .parse({ assetId: assetIdValue, statusId: statusIdValue });
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired. Sign in again and retry.");
  const [asset, status] = await Promise.all([requireCampaignAsset(context, assetId), requireTaskStatus(context, statusId)]);
  const { data, error } = await context.supabase
    .from("website-campaign-assets")
    .update({
      status_id: status.id,
      completed_at: status.key === "posted_done" ? new Date().toISOString() : null,
      updated_by: context.claims.sub,
    })
    .eq("id", asset.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The asset status could not be changed.");
  revalidateCampaigns();
  return { ok: true };
}

export async function archiveCampaignAsset(assetIdValue: string) {
  const assetId = z.string().uuid().parse(assetIdValue);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const asset = await requireCampaignAsset(context, assetId);
  const { data, error } = await context.supabase
    .from("website-campaign-assets")
    .update({ archived_at: new Date().toISOString(), updated_by: context.claims.sub })
    .eq("id", asset.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .is("archived_at", null)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The campaign asset could not be removed.");
  revalidateCampaigns();
  return { ok: true };
}

export async function saveCampaignAttachment(inputValue: {
  assetId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}) {
  const input = z.object({
    assetId: z.string().uuid(),
    storagePath: z.string().trim().min(40).max(600),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(3).max(150),
    fileSizeBytes: z.number().int().min(1).max(100 * 1024 * 1024),
  }).parse(inputValue);
  const pathPattern = new RegExp(`^${TRUSHOT_WORKSPACE_ID}/campaigns/${input.assetId}/[0-9a-f-]{36}\/[a-zA-Z0-9._-]{1,180}$`);
  if (!pathPattern.test(input.storagePath) || !attachmentMimeTypes.has(input.mimeType)) {
    throw new Error("That campaign attachment is not an accepted file.");
  }
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  await requireCampaignAsset(context, input.assetId);
  const { data, error } = await context.supabase
    .from("website-campaign-attachments")
    .insert({
      workspace_id: TRUSHOT_WORKSPACE_ID,
      campaign_asset_id: input.assetId,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      created_by: context.claims.sub,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The attachment record could not be saved.");
  revalidateCampaigns();
  return { ok: true, id: data.id };
}

export async function deleteCampaignAttachment(attachmentIdValue: string) {
  const attachmentId = z.string().uuid().parse(attachmentIdValue);
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  const { data: attachment, error: readError } = await context.supabase
    .from("website-campaign-attachments")
    .select("id,campaign_asset_id,storage_path")
    .eq("id", attachmentId)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .single();
  if (readError || !attachment) throw new Error("That attachment is no longer available.");
  await requireCampaignAsset(context, attachment.campaign_asset_id);
  const { error: storageError } = await context.supabase.storage
    .from("website-campaign-attachments")
    .remove([attachment.storage_path]);
  if (storageError) throw new Error(storageError.message);
  const { data, error } = await context.supabase
    .from("website-campaign-attachments")
    .delete()
    .eq("id", attachment.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The attachment could not be removed.");
  revalidateCampaigns();
  return { ok: true };
}
