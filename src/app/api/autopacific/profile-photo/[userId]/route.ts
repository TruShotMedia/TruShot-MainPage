import { createClient } from "@/lib/supabase/server";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { ownsProfilePhoto, PROFILE_PHOTO_BUCKET } from "@/lib/production-profile";
import { z } from "zod";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!z.uuid().safeParse(userId).success) return notFound();
  const supabase = await createClient();
  const { data: session, error: authError } = await supabase.auth.getClaims();
  if (authError || !session?.claims?.sub) return notFound();
  // Both the profile and the private object enforce workspace membership + MFA.
  const { data: profile, error } = await supabase.from("website-production-profiles").select("avatar_path")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", userId).maybeSingle();
  if (error || !profile?.avatar_path || !ownsProfilePhoto(profile.avatar_path, TRUSHOT_WORKSPACE_ID, userId)) return notFound();
  const { data: photo, error: storageError } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).download(profile.avatar_path);
  if (!photo || storageError) return notFound();
  return new Response(photo, { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=60", "Vary": "Cookie" } });
}
