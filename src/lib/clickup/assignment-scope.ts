import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The connected ClickUp profile belongs to John, not every workspace member. */
export async function assignedToClickUpOwner(supabase: SupabaseClient, workspaceId: string, assigneeIds: unknown) {
  if (!Array.isArray(assigneeIds) || !assigneeIds.length) return false;
  const { data, error } = await supabase.from("website-production-team").select("user_id")
    .eq("workspace_id", workspaceId).eq("is_primary_videographer", true).eq("is_active", true).single();
  if (error || !data) throw new Error("The ClickUp owner assignment could not be verified.");
  return assigneeIds.includes(data.user_id);
}
