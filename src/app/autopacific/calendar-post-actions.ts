"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getProductionContext } from "@/lib/data/admin";

const completionInput = z.object({ id: z.uuid(), completed: z.boolean() });

export async function setScheduledPostCompletion(input: unknown) {
  const parsed = completionInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Choose a valid scheduled post." };
  const context = await getProductionContext();
  if (!context || context.membership.workspace_id !== TRUSHOT_WORKSPACE_ID) {
    return { ok: false as const, error: "Sign in again to update this scheduled post." };
  }
  const { id, completed } = parsed.data;
  // The caller's existing calendar permissions apply. The update cannot modify
  // a regular event or overwrite another edit to the post's title or schedule.
  const { data, error } = await context.supabase.from("website-calendar-events")
    .update({ post_completed_at: completed ? new Date().toISOString() : null, updated_by: context.claims.sub })
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("id", id)
    .eq("event_kind", "post")
    .select("post_completed_at,updated_at")
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "Couldn’t update this scheduled post. Try again." };
  for (const path of ["/autopacific", "/autopacific/mobile", "/marketing", "/admin/calendar", "/tablet"]) revalidatePath(path);
  return { ok: true as const, post: data as { post_completed_at: string | null; updated_at: string } };
}
