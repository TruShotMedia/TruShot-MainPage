import "server-only";
import { randomUUID } from "node:crypto";
import { getProductionContext } from "./admin";
import { getProductionTeam } from "./production-team";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { ownsProfilePhoto, PROFILE_PHOTO_BUCKET, profilePhotoUrl, validateProfilePhoto, type MyAccount } from "@/lib/production-profile";

async function accountContext() {
  const context = await getProductionContext();
  if (!context) throw new Error("Sign in again to manage your account.");
  const team = await getProductionTeam(context.supabase, context.claims.sub, context.access === "admin");
  return { ...context, team };
}

export async function getMyAccount(): Promise<MyAccount> {
  const { supabase, team, claims, membership } = await accountContext();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== team.userId) throw new Error("Your account could not be loaded. Sign in again.");
  const self = team.members.find(member => member.user_id === team.userId);
  return { userId: team.userId, displayName: self?.display_name ?? membership.display_name ?? "My account",
    email: data.user.email ?? "", username: self?.username ?? null, role: team.role,
    createdAt: data.user.created_at, avatarUrl: team.selfAvatarUrl ?? null,
    mfaEnabled: Boolean(data.user.factors?.some(factor => factor.status === "verified")), verifiedSession: claims.aal === "aal2" };
}

/** The owner comes from the verified session, never from form fields. */
export async function updateMyPhoto(file: File | null) {
  const { supabase, team } = await accountContext();
  const bytes = file ? await validateProfilePhoto(file) : null;
  const { data: previous, error: readError } = await supabase.from("website-production-profiles").select("avatar_path")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", team.userId).maybeSingle();
  if (readError) throw new Error("Your photo could not be loaded. Please retry.");
  const path = bytes ? `${TRUSHOT_WORKSPACE_ID}/${team.userId}/${randomUUID()}.webp` : null;
  const bucket = supabase.storage.from(PROFILE_PHOTO_BUCKET);
  if (bytes && path) {
    const { error } = await bucket.upload(path, bytes, { contentType: "image/webp", cacheControl: "60", upsert: false });
    if (error) throw new Error("Your photo could not be uploaded. Check your connection and try again.");
  }
  const revision = new Date().toISOString();
  const { error } = await supabase.from("website-production-profiles").upsert({ workspace_id: TRUSHOT_WORKSPACE_ID,
    user_id: team.userId, avatar_path: path, updated_at: revision }, { onConflict: "workspace_id,user_id" });
  if (error) {
    if (path) await bucket.remove([path]);
    throw new Error("Your photo could not be saved. Please retry.");
  }
  if (previous?.avatar_path && ownsProfilePhoto(previous.avatar_path, TRUSHOT_WORKSPACE_ID, team.userId)) {
    const { error: cleanupError } = await bucket.remove([previous.avatar_path]);
    if (cleanupError) console.warn("A replaced workspace avatar is awaiting storage cleanup.");
  }
  return { avatarUrl: path ? profilePhotoUrl(team.userId, revision) : null };
}
