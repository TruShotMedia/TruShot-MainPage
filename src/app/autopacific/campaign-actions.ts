"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProductionContext } from "@/lib/data/admin";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { campaignPlanSchema } from "@/lib/production-campaign-schema";
import type { CampaignPlan, CampaignPlanJob } from "@/lib/production-campaigns";
import { scheduleClickUpJobSync } from "@/lib/clickup/job-sync";

async function campaignContext() {
  const context = await getProductionContext();
  if (!context) throw new Error("Your session has expired. Sign in again.");
  const { data: client, error } = await context.supabase.from("website-clients").select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("name", "Autopacific Group").is("archived_at", null).single();
  if (error || !client) throw new Error("The AutoPacific workspace is unavailable.");
  return { ...context, clientId: client.id as string };
}

export async function loadProductionCampaigns(): Promise<CampaignPlan[]> {
  const { supabase, clientId } = await campaignContext();
  const { data: campaigns, error } = await supabase.from("website-campaigns")
    .select("id,title,objective,notes,start_date,updated_at")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("client_id", clientId).eq("is_weekly_plan", true)
    .is("archived_at", null).order("start_date", { ascending: false });
  if (error) throw new Error("Campaigns could not be loaded. Please retry.");
  if (!campaigns?.length) return [];
  const { data: weeks, error: weekError } = await supabase.from("website-campaign-weeks")
    .select("id,campaign_id,title,position").eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .in("campaign_id", campaigns.map(campaign => campaign.id)).order("position");
  if (weekError) throw new Error("Campaign weeks could not be loaded.");
  const weekIds = (weeks ?? []).map(week => week.id);
  const { data: jobs, error: jobError } = weekIds.length ? await supabase.from("website-jobs")
    .select('id,campaign_week_id,title,status_id,shoot_date,due_date,description,location,deliverables,updated_at,tasks:"website-job-tasks"(id,title,source_deliverable_id,completed_at,archived_at)')
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("client_id", clientId).in("campaign_week_id", weekIds)
    .is("archived_at", null).order("shoot_date", { nullsFirst: false }) : { data: [], error: null };
  if (jobError) throw new Error("Campaign jobs could not be loaded.");
  return campaigns.map(campaign => ({ ...campaign, start_date: campaign.start_date!, weeks: (weeks ?? [])
    .filter(week => week.campaign_id === campaign.id).map(week => ({ id: week.id, title: week.title,
      jobs: (jobs ?? []).filter(job => job.campaign_week_id === week.id).map(job => ({ ...job,
        tasks: (job.tasks ?? []).filter(task => !task.archived_at),
      })) as CampaignPlanJob[],
    })),
  }));
}

function revalidateCampaignWorkspaces() {
  for (const path of ["/autopacific", "/autopacific/mobile", "/marketing", "/admin/jobs", "/admin/tasks", "/admin/calendar", "/tablet"])
    revalidatePath(path);
}

export async function saveProductionCampaign(input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = campaignPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the campaign details." };
  try {
    const { supabase, clientId } = await campaignContext();
    const { data, error } = await supabase.rpc("website-save-campaign-plan", {
      p_workspace_id: TRUSHOT_WORKSPACE_ID, p_client_id: clientId, p_plan: parsed.data,
    });
    if (error) return { ok: false, error: error.message };
    scheduleClickUpJobSync();
    revalidateCampaignWorkspaces();
    return { ok: true, id: data as string };
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : "Campaign could not be saved. Please retry." };
  }
}

/** Archive the campaign, never the jobs/tasks beneath it. */
export async function archiveProductionCampaign(id: string, expectedUpdatedAt: string) {
  try {
    const { supabase, clientId } = await campaignContext();
    const { data, error } = await supabase.from("website-campaigns")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", z.uuid().parse(id)).eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("client_id", clientId)
      .eq("is_weekly_plan", true).eq("updated_at", z.iso.datetime({ offset: true }).parse(expectedUpdatedAt))
      .is("archived_at", null).select("id").single();
    if (error || !data) return { ok: false as const, error: "This campaign changed elsewhere. Refresh and try again." };
    revalidateCampaignWorkspaces();
    return { ok: true as const };
  } catch (reason) {
    return { ok: false as const, error: reason instanceof Error ? reason.message : "Campaign could not be archived." };
  }
}
