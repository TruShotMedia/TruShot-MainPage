"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";
import { INGREIGN_PRESET_KEYS } from "@/lib/ingreign";

const generatorModeSchema = z.enum(["date_only", "countdown_3", "countdown_2", "countdown_1"]);

function revalidateIngreign() {
  revalidatePath("/admin/ingreign");
  revalidatePath("/ingreign");
  revalidatePath("/ingreign/captions");
  revalidatePath("/ingreign/generator");
}

export async function updateIngreignCaption(formData: FormData) {
  const input = z.object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(80),
    caption: z.string().trim().min(1).max(4000),
    generator_mode: generatorModeSchema,
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired.");
  const { data, error } = await context.supabase
    .from("website-ingreign-caption-presets")
    .update({ label: input.label, caption: input.caption, generator_mode: input.generator_mode })
    .eq("id", input.id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The caption could not be saved.");
  revalidateIngreign();
}

export async function saveIngreignManualEvent(formData: FormData) {
  const input = z.object({
    id: z.string().uuid().or(z.literal("")).optional().default(""),
    title: z.string().trim().min(1).max(160),
    calendar_label: z.string().trim().min(1).max(120),
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preset_key: z.enum(INGREIGN_PRESET_KEYS).or(z.literal("")),
    generator_mode: generatorModeSchema,
    month_label: z.string().trim().max(20),
    day_label: z.string().trim().max(4),
    caption_override: z.string().trim().max(4000),
    notification_enabled: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired.");
  const values = {
    workspace_id: TRUSHOT_WORKSPACE_ID,
    title: input.title,
    calendar_label: input.calendar_label,
    event_date: input.event_date,
    preset_key: input.preset_key || null,
    generator_mode: input.generator_mode,
    month_label: input.month_label || null,
    day_label: input.day_label || null,
    caption_override: input.caption_override || null,
    notification_enabled: input.notification_enabled === "on",
    updated_by: context.claims.sub,
  };
  const result = input.id
    ? await context.supabase.from("website-ingreign-manual-events").update(values).eq("id", input.id).eq("workspace_id", TRUSHOT_WORKSPACE_ID).select("id").single()
    : await context.supabase.from("website-ingreign-manual-events").insert({ ...values, created_by: context.claims.sub }).select("id").single();
  if (result.error || !result.data) throw new Error(result.error?.message ?? "The calendar entry could not be saved.");
  revalidateIngreign();
}

export async function deleteIngreignManualEvent(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const context = await getAdminContext();
  if (!context) throw new Error("Your admin session has expired.");
  const { data, error } = await context.supabase
    .from("website-ingreign-manual-events")
    .delete()
    .eq("id", id)
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The calendar entry could not be removed.");
  revalidateIngreign();
}

