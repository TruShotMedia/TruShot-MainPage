import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import type { TeamContextData, TeamMember } from "@/lib/production-team";

export const getProductionTeam = cache(async (supabase: SupabaseClient, userId: string, admin = false): Promise<TeamContextData> => {
  const { data, error } = await supabase.from("website-production-team")
    .select("user_id,display_name,username,role,is_active,avatar_color,enabled_at,is_primary_videographer")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("is_active", true).order("display_name");
  if (error) throw new Error("Team membership could not be verified. Please retry.");
  const members = (data ?? []) as TeamMember[];
  const self = members.find(member => member.user_id === userId);
  if (!admin && !self) throw new Error("Your account is not enabled for this team.");
  const videographerId = members.find(member => member.is_primary_videographer)?.user_id ?? "";
  if (!videographerId) throw new Error("The shared Videographer workspace is not configured.");
  return { userId, role: admin ? "admin" : self!.role, members, videographerId, canManage: admin || self?.role === "manager" };
});
