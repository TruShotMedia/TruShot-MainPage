"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProductionContext } from "@/lib/data/admin";
import { getProductionTeam } from "@/lib/data/production-team";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import type { TeamComment, TeamDirectoryMember } from "@/lib/production-team";

async function teamContext() {
  const context = await getProductionContext();
  if (!context) throw new Error("Sign in again to use your team workspace.");
  const team = await getProductionTeam(context.supabase, context.claims.sub, context.access === "admin");
  return { ...context, team };
}

export async function loadTeamDirectory(): Promise<TeamDirectoryMember[]> {
  const { supabase, team } = await teamContext();
  if (!team.canManage) throw new Error("Only your team manager can manage membership.");
  const { data, error } = await supabase.rpc("website-team-directory", { p_workspace: TRUSHOT_WORKSPACE_ID });
  if (error) throw new Error("The account directory could not be loaded.");
  return data as TeamDirectoryMember[];
}

export async function saveTeamMember(input: unknown) {
  const parsed = z.object({ user_id: z.uuid(), display_name: z.string().trim().min(1).max(80),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{1,39}$/, "Use 2–40 letters, numbers, dots or dashes for the username."),
    role: z.enum(["manager", "videographer", "marketing"]), is_active: z.boolean(),
  }).parse(input);
  const { supabase, team } = await teamContext();
  if (!team.canManage) throw new Error("Only your team manager can manage membership.");
  const { error } = await supabase.rpc("website-save-team-member", { p_workspace: TRUSHOT_WORKSPACE_ID,
    p_user: parsed.user_id, p_name: parsed.display_name, p_username: parsed.username, p_role: parsed.role, p_active: parsed.is_active });
  if (error) throw new Error(error.message.includes("username") ? "That username is already in use. Choose another." : error.message);
  revalidatePath("/autopacific"); revalidatePath("/autopacific/mobile"); revalidatePath("/marketing");
  return { ok: true };
}

export async function loadTeamComments(): Promise<TeamComment[]> {
  const { supabase } = await teamContext();
  const { data, error } = await supabase.rpc("website-team-comment-feed", { p_workspace: TRUSHOT_WORKSPACE_ID });
  if (error) throw new Error("Comment updates could not be loaded. Please retry.");
  return (data ?? []) as TeamComment[];
}

/** Acknowledge exactly the revision displayed, not edits arriving afterwards. */
export async function markTeamCommentsRead(input: unknown) {
  const revisions = z.array(z.object({ id: z.uuid(), updated_at: z.iso.datetime({ offset: true }) })).max(200).parse(input);
  const { supabase, team } = await teamContext();
  if (!revisions.length) return;
  const { error } = await supabase.from("website-note-reads").upsert(revisions.map(item => ({
    note_id: item.id, user_id: team.userId, seen_revision: item.updated_at,
  })), { onConflict: "note_id,user_id" });
  if (error) throw new Error("Read status could not be saved. Please retry.");
}
