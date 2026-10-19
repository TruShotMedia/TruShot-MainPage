"use server";

import { revalidatePath } from "next/cache";
import { connectClickUpJobSync, dispatchClickUpJobSync, scheduleClickUpJobSync } from "@/lib/clickup/job-sync";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";

async function requireIntegrationAdmin() {
  const context = await getAdminContext();
  if (!context || !["owner", "admin"].includes(context.membership.role)) {
    throw new Error("Only a workspace owner or admin can manage integrations.");
  }
  return context;
}

export async function connectClickUpIntegration() {
  await requireIntegrationAdmin();
  const result = await connectClickUpJobSync();
  revalidatePath("/admin/settings");
  return {
    ok: true as const,
    message: `Connected ${result.user.username} to ${result.list.name}. ${result.sync.message}`,
  };
}

export async function syncClickUpIntegration() {
  const context = await requireIntegrationAdmin();
  const { error: retryError } = await context.supabase
    .from("website-clickup-sync-outbox")
    .update({
      status: "retry",
      attempts: 0,
      available_at: new Date().toISOString(),
      processing_started_at: null,
      completed_at: null,
      last_error: null,
    })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("status", "failed");
  if (retryError) throw new Error(retryError.message);
  const result = await dispatchClickUpJobSync({ limit: 100 });
  revalidatePath("/admin/settings");
  return { ok: result.status === "completed", message: result.message };
}

export async function setClickUpIntegrationEnabled(enabled: boolean) {
  const context = await requireIntegrationAdmin();
  const { data, error } = await context.supabase
    .from("website-clickup-integrations")
    .update({ enabled, last_error: null })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "The ClickUp integration could not be updated.");
  if (enabled) scheduleClickUpJobSync();
  revalidatePath("/admin/settings");
  return { ok: true as const, message: enabled ? "ClickUp mirroring resumed." : "ClickUp mirroring paused." };
}
