"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, LayoutDashboard, RectangleHorizontal, RectangleVertical, RefreshCw, Rows3 } from "lucide-react";
import { PipelineBoard } from "@/components/admin/pipeline-board";
import { NotionAutoSync } from "@/components/admin/notion-auto-sync";
import { TabletCalendar } from "@/components/tablet/tablet-calendar";
import { parseTabletOrientation, TABLET_ORIENTATION_STORAGE_KEY, TABLET_VIEW_COOKIE_NAME, type TabletOrientation, type TabletView } from "@/lib/tablet-view";
import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarJob, CalendarTask, PipelineTask, TaskStatus } from "@/lib/types";

const tabletPipelineStatusKeys = ["not_started", "in_progress", "ready_for_revision", "final_draft_notes"];
const tabletPipelineStatusAliases = { ready_to_post: "final_draft_notes" };

const timeFormatter = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Brisbane",
});

const dateFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "Australia/Brisbane",
  weekday: "short",
});

function viewportOrientation(): TabletOrientation {
  return window.innerWidth >= window.innerHeight ? "landscape" : "portrait";
}

export function TabletPipelineKiosk({
  calendarJobs,
  calendarTasks,
  calendarCampaignAssets = [],
  calendarEvents = [],
  initialNow,
  initialStatuses,
  initialTasks,
  initialView,
  pendingRequestCount,
  pipelineVersion,
  notionSyncEnabled,
  notionSyncIntervalMinutes,
  refreshIntervalMinutes,
  today,
}: {
  calendarJobs: CalendarJob[];
  calendarTasks: CalendarTask[];
  calendarCampaignAssets?: CalendarCampaignAsset[];
  calendarEvents?: CalendarCustomEvent[];
  initialNow: string;
  initialStatuses: TaskStatus[];
  initialTasks: PipelineTask[];
  initialView: TabletView;
  pendingRequestCount: number;
  pipelineVersion: string;
  notionSyncEnabled: boolean;
  notionSyncIntervalMinutes: number;
  refreshIntervalMinutes: number;
  today: string;
}) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<TabletView>(initialView);
  const [now, setNow] = useState(() => new Date(initialNow));
  const [preferredOrientation, setPreferredOrientation] = useState<TabletOrientation | null>(null);
  const [currentViewportOrientation, setCurrentViewportOrientation] = useState<TabletOrientation | null>(null);
  const lastRefreshAt = useRef(new Date(initialNow).getTime());
  const refreshIntervalMs = refreshIntervalMinutes * 60_000;
  const effectiveOrientation = preferredOrientation ?? currentViewportOrientation ?? "landscape";
  const isCssRotated = Boolean(preferredOrientation && currentViewportOrientation && preferredOrientation !== currentViewportOrientation);

  const refresh = useCallback(() => {
    lastRefreshAt.current = Date.now();
    router.refresh();
  }, [router]);

  const selectView = useCallback((view: TabletView) => {
    setActiveView(view);
    document.cookie = `${TABLET_VIEW_COOKIE_NAME}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  const rotateOrientation = useCallback(async () => {
    const nextOrientation: TabletOrientation = effectiveOrientation === "landscape" ? "portrait" : "landscape";
    setPreferredOrientation(nextOrientation);
    window.localStorage.setItem(TABLET_ORIENTATION_STORAGE_KEY, nextOrientation);

    const orientation = window.screen.orientation as ScreenOrientation & {
      lock?: (orientation: TabletOrientation) => Promise<void>;
    };
    try {
      await orientation?.lock?.(nextOrientation);
    } catch {
      // Kiosk browsers commonly restrict native locks. The CSS rotation below
      // provides the same usable orientation without requiring browser support.
    } finally {
      setCurrentViewportOrientation(viewportOrientation());
    }
  }, [effectiveOrientation]);

  useEffect(() => {
    const updateViewportOrientation = () => setCurrentViewportOrientation(viewportOrientation());
    const restoreOrientation = window.requestAnimationFrame(() => {
      setPreferredOrientation(parseTabletOrientation(window.localStorage.getItem(TABLET_ORIENTATION_STORAGE_KEY)));
      updateViewportOrientation();
    });
    window.addEventListener("resize", updateViewportOrientation);
    return () => {
      window.cancelAnimationFrame(restoreOrientation);
      window.removeEventListener("resize", updateViewportOrientation);
    };
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 15_000);
    const refreshIfAvailable = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      refresh();
    };
    const refreshIfStale = () => {
      if (Date.now() - lastRefreshAt.current >= refreshIntervalMs) refreshIfAvailable();
    };
    const sync = window.setInterval(refreshIfAvailable, refreshIntervalMs);
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("online", refreshIfStale);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(sync);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("online", refreshIfStale);
    };
  }, [refresh, refreshIntervalMs]);

  return (
    <main className={`tablet-kiosk-viewport ${isCssRotated ? "is-css-rotated" : ""}`}>
      <div className="tablet-kiosk" data-orientation={effectiveOrientation}>
        <NotionAutoSync enabled={notionSyncEnabled} intervalMinutes={notionSyncIntervalMinutes} />
        <header className="tablet-kiosk-header">
          <div className="tablet-kiosk-identity">
            <Image src="/brand/logo-green.png" alt="TruShot Media" width={230} height={84} priority />
            <div className="tablet-kiosk-clock" aria-label={`Brisbane time ${timeFormatter.format(now)}`}>
              <strong suppressHydrationWarning>{timeFormatter.format(now)}</strong>
              <span suppressHydrationWarning>{dateFormatter.format(now)}</span>
            </div>
          </div>

          <nav className="tablet-kiosk-tabs" aria-label="Tablet views">
            <button type="button" className={activeView === "pipeline" ? "is-active" : ""} onClick={() => selectView("pipeline")} aria-current={activeView === "pipeline" ? "page" : undefined}><Rows3 size={15} /> Pipeline</button>
            <button type="button" className={activeView === "calendar" ? "is-active" : ""} onClick={() => selectView("calendar")} aria-current={activeView === "calendar" ? "page" : undefined}><CalendarDays size={15} /> Calendar</button>
          </nav>

          <div className="tablet-kiosk-actions">
            <Link className="tablet-notification-button" href="/admin/requests" aria-label={`${pendingRequestCount} client ${pendingRequestCount === 1 ? "request" : "requests"} awaiting review`} title="Client requests">
              <Bell size={15} />
              {pendingRequestCount ? <span>{pendingRequestCount > 99 ? "99+" : pendingRequestCount}</span> : null}
            </Link>
            <button type="button" onClick={rotateOrientation} aria-label={`Switch kiosk to ${effectiveOrientation === "landscape" ? "portrait" : "landscape"}`} title={`Switch to ${effectiveOrientation === "landscape" ? "portrait" : "landscape"}`}>
              {effectiveOrientation === "landscape" ? <RectangleVertical size={15} /> : <RectangleHorizontal size={15} />}
            </button>
            <button type="button" onClick={refresh} aria-label="Refresh tablet data" title="Refresh"><RefreshCw size={15} /></button>
            <Link className="tablet-crm-button" href="/admin"><LayoutDashboard size={15} /> CRM</Link>
          </div>
        </header>

        <section className="tablet-kiosk-main" aria-label={activeView === "pipeline" ? "Tablet asset pipeline" : "Tablet production calendar"}>
          {activeView === "pipeline" ? (
            <PipelineBoard
              key={pipelineVersion}
              completionStatusKey="final_draft_notes"
              initialStatuses={initialStatuses}
              initialTasks={initialTasks}
              statusAliases={tabletPipelineStatusAliases}
              variant="tablet"
              visibleStatusKeys={tabletPipelineStatusKeys}
            />
          ) : <TabletCalendar jobs={calendarJobs} tasks={calendarTasks} campaignAssets={calendarCampaignAssets} customEvents={calendarEvents} today={today} />}
        </section>
      </div>
    </main>
  );
}
