"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AUTOPACIFIC_LOGIN_EMAIL, AUTOPACIFIC_PORTAL_KEY, safeAutopacificPath } from "@/lib/autopacific-access";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function signInToAutopacific(formData: FormData) {
  const surface = formData.get("surface") === "marketing" ? "marketing" : "autopacific";
  const destination = safeAutopacificPath(String(formData.get("next") ?? ""), surface === "marketing" ? "/marketing" : "/autopacific");
  const failure = (error: string) => `/${surface}/login?${new URLSearchParams({ error, next: destination })}`;
  const password = z.string().min(6).max(256).safeParse(formData.get("password"));
  if (!password.success) redirect(failure("credentials"));
  const supabase = await createClient();
  // The account is fixed on the server, never taken from a hidden email input.
  const { data, error } = await supabase.auth.signInWithPassword({ email: AUTOPACIFIC_LOGIN_EMAIL, password: password.data });
  if (error || !data.user) redirect(failure("credentials"));
  const { data: membership } = await supabase.from("website-portal-users").select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", data.user.id)
    .eq("portal_key", AUTOPACIFIC_PORTAL_KEY).eq("is_active", true).maybeSingle();
  if (!membership) {
    await supabase.auth.signOut();
    redirect(failure("access"));
  }
  revalidatePath("/autopacific", "layout");
  revalidatePath("/marketing", "layout");
  redirect(destination);
}

export async function signOutOfAutopacific(destination = "/autopacific") {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(safeAutopacificPath(destination).startsWith("/marketing") ? "/marketing/login" : "/autopacific/login");
}
