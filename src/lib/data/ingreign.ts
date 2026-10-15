import { cache } from "react";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { getAdminContext } from "@/lib/data/admin";
import { INGREIGN_PORTAL_KEY, type IngreignCaptionPreset, type IngreignManualEvent } from "@/lib/ingreign";
import { createClient } from "@/lib/supabase/server";

export const getIngreignContext = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: portalMembership } = await supabase
    .from("website-portal-users")
    .select("id,workspace_id,display_name,portal_key")
    .eq("user_id", userId)
    .eq("portal_key", INGREIGN_PORTAL_KEY)
    .eq("is_active", true)
    .maybeSingle();

  if (portalMembership) {
    return { supabase, claims: claims.claims, membership: portalMembership, access: "portal" as const };
  }

  const { data: adminMembership } = await supabase
    .from("website-admin-users")
    .select("id,workspace_id,display_name,role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!adminMembership) return null;
  return { supabase, claims: claims.claims, membership: adminMembership, access: "admin" as const };
});

async function loadPresets() {
  const context = await getIngreignContext();
  if (!context) return null;
  const { data, error } = await context.supabase
    .from("website-ingreign-caption-presets")
    .select("id,preset_key,label,caption,generator_mode,position,is_active")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("is_active", true)
    .order("position");
  if (error) throw new Error("The INGREIGN captions could not be loaded.");
  return { context, presets: (data ?? []) as IngreignCaptionPreset[] };
}

async function loadManualEvents() {
  const context = await getIngreignContext();
  if (!context) return null;
  const { data, error } = await context.supabase
    .from("website-ingreign-manual-events")
    .select("id,title,calendar_label,event_date,preset_key,generator_mode,month_label,day_label,caption_override,notification_enabled,created_at,updated_at")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .order("event_date");
  if (error) throw new Error("The INGREIGN calendar could not be loaded.");
  return { context, manualEvents: (data ?? []) as IngreignManualEvent[] };
}

export const getIngreignPresetsData = cache(loadPresets);
export const getIngreignEventsData = cache(loadManualEvents);

export const getIngreignGeneratorData = cache(async () => {
  const [presetsData, eventsData] = await Promise.all([loadPresets(), loadManualEvents()]);
  if (!presetsData || !eventsData) return null;
  return {
    context: presetsData.context,
    presets: presetsData.presets,
    manualEvents: eventsData.manualEvents,
  };
});

export const getIngreignNotificationData = cache(async () => {
  const context = await getIngreignContext();
  if (!context) return null;
  const result = context.access === "portal"
    ? await context.supabase
        .from("website-ingreign-push-subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.claims.sub)
    : { count: 0, error: null };
  if (result.error) throw new Error("INGREIGN reminder settings could not be loaded.");
  return { context, subscriptionCount: result.count ?? 0 };
});

export async function getIngreignAdminData() {
  const context = await getAdminContext();
  if (!context) return null;
  const [presetsResult, eventsResult, portalUsersResult, subscriptionsResult] = await Promise.all([
    context.supabase
      .from("website-ingreign-caption-presets")
      .select("id,preset_key,label,caption,generator_mode,position,is_active")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("position"),
    context.supabase
      .from("website-ingreign-manual-events")
      .select("id,title,calendar_label,event_date,preset_key,generator_mode,month_label,day_label,caption_override,notification_enabled,created_at,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("event_date"),
    context.supabase
      .from("website-portal-users")
      .select("id,display_name,is_active,user_id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("portal_key", INGREIGN_PORTAL_KEY),
    context.supabase
      .from("website-ingreign-push-subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
  ]);
  const error = presetsResult.error ?? eventsResult.error ?? portalUsersResult.error ?? subscriptionsResult.error;
  if (error) throw new Error(`INGREIGN controls could not be loaded: ${error.message}`);
  return {
    presets: (presetsResult.data ?? []) as IngreignCaptionPreset[],
    manualEvents: (eventsResult.data ?? []) as IngreignManualEvent[],
    portalUsers: portalUsersResult.data ?? [],
    subscriptionCount: subscriptionsResult.count ?? 0,
  };
}
