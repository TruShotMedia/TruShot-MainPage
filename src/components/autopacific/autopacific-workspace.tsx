import { cookies } from "next/headers";
import { headers } from "next/headers";
import { ProductionDesktop } from "@/components/autopacific/production-desktop";
import { redirect } from "next/navigation";
import { TabletPipelineKiosk } from "@/components/tablet/tablet-pipeline-kiosk";
import { TABLET_REFRESH_INTERVAL_MINUTES } from "@/lib/config";
import { getProductionContext, getTabletKioskData } from "@/lib/data/admin";
import { todayDateInput } from "@/lib/format";
import { getNotionConfigurationSummary } from "@/lib/notion/config";
import { parseTabletView, TABLET_VIEW_COOKIE_NAME } from "@/lib/tablet-view";
import { PRODUCTION_WORDMARK } from "@/lib/production-branding";
import { scopeCalendarForWorkspace } from "@/lib/marketing-calendar-scope";
import { getProductionTeam } from "@/lib/data/production-team";
import { ProductionTeamProvider } from "./team-context";
import { scopeProductionSpace } from "@/lib/production-team";

const AUTOPACIFIC_CLIENT_NAME = "Autopacific Group";

export async function AutopacificWorkspace({ experience, requestedView, requestedJobId, forceKiosk = false, mode = "production" }: { experience: "kiosk" | "mobile"; requestedView?: string; requestedJobId?: string; forceKiosk?: boolean; mode?: "production" | "marketing" }) {
  const isMarketing = mode === "marketing";
  const context = await getProductionContext();
  if (!context) {
    const pathname = isMarketing ? "/marketing" : experience === "mobile" ? "/autopacific/mobile" : "/autopacific";
    const query = new URLSearchParams();
    if (requestedView) query.set("view", requestedView);
    if (requestedJobId) query.set("job", requestedJobId);
    if (forceKiosk) query.set("display", "kiosk");
    const destination = `${pathname}${query.size ? `?${query}` : ""}`;
    redirect(`${isMarketing ? "/marketing" : "/autopacific"}/login?next=${encodeURIComponent(destination)}`);
  }

  const [workspaceData, cookieStore, team] = await Promise.all([
    getTabletKioskData({ clientName: AUTOPACIFIC_CLIENT_NAME, includeOtherCalendarItems: true }),
    cookies(),
    getProductionTeam(context.supabase, context.claims.sub, context.access === "admin"),
  ]);
  if (!isMarketing && team.role === "marketing") redirect("/marketing");
  const data = scopeCalendarForWorkspace(workspaceData, mode);
  const notion = getNotionConfigurationSummary();
  const userAgent=(await headers()).get("user-agent")??"";
  const desktop=experience!=="mobile"&&!forceKiosk&&!/Android|iPad|iPhone|CrOS|SMART-TV|Tizen|Web0S|TV|Kiosk/i.test(userAgent);
  if(desktop || experience === "mobile") return <ProductionTeamProvider value={team}><ProductionDesktop experience={experience === "mobile" ? "mobile" : "desktop"} data={data} mode={mode} initialView={requestedView??cookieStore.get(isMarketing?"autopacific-marketing-view":TABLET_VIEW_COOKIE_NAME)?.value??"jobs"} requestedJobId={requestedJobId} today={todayDateInput()} refreshIntervalMinutes={TABLET_REFRESH_INTERVAL_MINUTES} notificationPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY??""} notionSyncEnabled={context.access==="admin"&&notion.configured} notionSyncIntervalMinutes={notion.syncIntervalMinutes}/></ProductionTeamProvider>;
  const kioskData = scopeProductionSpace(data, [team.videographerId]);
  const pipelineVersion = data.pipelineTasks
    .map((task) => `${task.id}:${task.status_id}:${task.updated_at}`)
    .join("|");

  return (
    <TabletPipelineKiosk
      initialJobId={requestedJobId}
      workspaceMode={mode}
      canOpenCrm={!isMarketing && context.access === "admin"}
      branding={{
        calendarAccentColor: "#5d91b0",
        calendarAccentClientName: AUTOPACIFIC_CLIENT_NAME,
        calendarAccentKeywords: ["autopacific", "autopac"],
        calendarCompletedColor: "#3f9b68",
        calendarMutedColor: "#687177",
        calendarOverdueColor: "#c5524a",
        logoAlt: PRODUCTION_WORDMARK.alt,
        logoHeight: PRODUCTION_WORDMARK.height,
        logoSrc: PRODUCTION_WORDMARK.src,
        logoSurface: "light",
        logoWidth: PRODUCTION_WORDMARK.width,
        screensaverLogo: {
          ...PRODUCTION_WORDMARK,
          surface: "light",
        },
        name: "Autopacific Group",
        location: isMarketing ? "Marketing" : "Production",
        theme: "autopacific",
      }}
      calendarJobs={kioskData.calendarJobs}
      calendarTasks={kioskData.calendarTasks}
      calendarCampaignAssets={kioskData.calendarCampaignAssets}
      calendarEvents={kioskData.calendarEvents}
      calendarEventClientId={data.clientOptions[0]?.id ?? null}
      calendarDensity="capacity"
      experience={experience}
      flightEvents={kioskData.flightEvents}
      clientOptions={data.clientOptions}
      initialNow={new Date().toISOString()}
      initialStatuses={data.statuses}
      initialTasks={kioskData.pipelineTasks}
      initialView={parseTabletView(requestedView ?? cookieStore.get(isMarketing ? "autopacific-marketing-view" : TABLET_VIEW_COOKIE_NAME)?.value ?? (isMarketing ? "planning" : undefined))}
      jobOptions={data.jobOptions}
      jobStatuses={data.jobStatuses}
      pipelineJobs={kioskData.pipelineJobs}
      pendingRequestCount={data.pendingRequestCount}
      pipelineVersion={pipelineVersion}
      notionSyncEnabled={context.access === "admin" && notion.configured}
      notionSyncIntervalMinutes={notion.syncIntervalMinutes}
      notificationPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      refreshIntervalMinutes={TABLET_REFRESH_INTERVAL_MINUTES}
      showTodayView
      today={todayDateInput()}
    />
  );
}
