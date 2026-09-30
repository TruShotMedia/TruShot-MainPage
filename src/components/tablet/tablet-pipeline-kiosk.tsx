"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, LayoutDashboard, ListChecks, Pause, Play, RectangleHorizontal, RectangleVertical, RefreshCw, Rows3 } from "lucide-react";
import { PipelineBoard } from "@/components/admin/pipeline-board";
import { NotionAutoSync } from "@/components/admin/notion-auto-sync";
import { TabletCalendar } from "@/components/tablet/tablet-calendar";
import { parseTabletOrientation, TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY, TABLET_ORIENTATION_STORAGE_KEY, TABLET_VIEW_COOKIE_NAME, type TabletOrientation, type TabletView } from "@/lib/tablet-view";
import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarJob, CalendarTask, PipelineTask, TaskStatus } from "@/lib/types";

const tabletPipelineStatusKeys = ["not_started", "in_progress", "ready_for_revision", "final_draft_notes"];
const tabletPipelineStatusAliases = { ready_to_post: "final_draft_notes" };
const tabletPageDurationMs = 60_000;
const tabletScreensaverDurationMs = 15_000;

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

const lockscreenDateFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  timeZone: "Australia/Brisbane",
  weekday: "long",
  year: "numeric",
});

type TabletViewportMetrics = {
  height: number;
  orientation: TabletOrientation;
  width: number;
};

function readViewportMetrics(): TabletViewportMetrics {
  const width = Math.round(window.visualViewport?.width ?? window.innerWidth ?? document.documentElement.clientWidth);
  const height = Math.round(window.visualViewport?.height ?? window.innerHeight ?? document.documentElement.clientHeight);
  return {
    height,
    orientation: width >= height ? "landscape" : "portrait",
    width,
  };
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
  const [isAutoRotationPaused, setIsAutoRotationPaused] = useState(false);
  const [isScreensaverVisible, setIsScreensaverVisible] = useState(false);
  const [liveTaskSnapshot, setLiveTaskSnapshot] = useState(() => ({ pipelineVersion, tasks: initialTasks }));
  const [now, setNow] = useState(() => new Date(initialNow));
  const [preferredOrientation, setPreferredOrientation] = useState<TabletOrientation | null>(null);
  const [currentViewportOrientation, setCurrentViewportOrientation] = useState<TabletOrientation | null>(null);
  const [viewportSize, setViewportSize] = useState<{ height: number; width: number } | null>(null);
  const lastRefreshAt = useRef(new Date(initialNow).getTime());
  const refreshIntervalMs = refreshIntervalMinutes * 60_000;
  const liveTasks = liveTaskSnapshot.pipelineVersion === pipelineVersion ? liveTaskSnapshot.tasks : initialTasks;
  const effectiveOrientation = preferredOrientation ?? currentViewportOrientation ?? "landscape";
  const isCssRotated = Boolean(preferredOrientation && currentViewportOrientation && preferredOrientation !== currentViewportOrientation);
  const kioskSummary = useMemo(() => {
    const openStatusIds = new Set(initialStatuses.filter((status) => status.is_open).map((status) => status.id));
    const outstandingTasks = liveTasks.filter((task) => openStatusIds.has(task.status_id));
    return {
      jobs: new Set(outstandingTasks.map((task) => task.job_id).filter(Boolean)).size,
      tasks: outstandingTasks.length,
    };
  }, [initialStatuses, liveTasks]);
  const viewportStyle = viewportSize ? {
    "--tablet-viewport-height": `${viewportSize.height}px`,
    "--tablet-viewport-width": `${viewportSize.width}px`,
  } as CSSProperties : undefined;

  const syncViewportMetrics = useCallback(() => {
    const metrics = readViewportMetrics();
    setCurrentViewportOrientation(metrics.orientation);
    setViewportSize((current) => (
      current?.height === metrics.height && current.width === metrics.width
        ? current
        : { height: metrics.height, width: metrics.width }
    ));
  }, []);

  const refresh = useCallback(() => {
    lastRefreshAt.current = Date.now();
    router.refresh();
  }, [router]);

  const selectView = useCallback((view: TabletView) => {
    setActiveView(view);
    setIsScreensaverVisible(false);
    document.cookie = `${TABLET_VIEW_COOKIE_NAME}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  const updateLiveTasks = useCallback((tasks: PipelineTask[]) => {
    setLiveTaskSnapshot({ pipelineVersion, tasks });
  }, [pipelineVersion]);

  const toggleAutoRotation = useCallback(() => {
    setIsAutoRotationPaused((isPaused) => {
      const nextPaused = !isPaused;
      window.localStorage.setItem(TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY, String(nextPaused));
      if (nextPaused) setIsScreensaverVisible(false);
      return nextPaused;
    });
  }, []);

  const rotateOrientation = useCallback(() => {
    const nextOrientation: TabletOrientation = effectiveOrientation === "landscape" ? "portrait" : "landscape";
    setPreferredOrientation(nextOrientation);
    window.localStorage.setItem(TABLET_ORIENTATION_STORAGE_KEY, nextOrientation);
    syncViewportMetrics();

    const orientation = (window.screen as Screen & {
      orientation?: ScreenOrientation & { lock?: (orientation: TabletOrientation) => Promise<void> };
    }).orientation;
    try {
      const nativeLock = orientation?.lock?.(nextOrientation);
      if (nativeLock) void nativeLock.then(syncViewportMetrics, syncViewportMetrics);
    } catch {
      // Kiosk browsers commonly restrict native locks. The CSS rotation below
      // provides the same usable orientation without requiring browser support.
    }
    window.requestAnimationFrame(syncViewportMetrics);
    window.setTimeout(syncViewportMetrics, 250);
  }, [effectiveOrientation, syncViewportMetrics]);

  useEffect(() => {
    const restoreOrientation = window.requestAnimationFrame(() => {
      setPreferredOrientation(parseTabletOrientation(window.localStorage.getItem(TABLET_ORIENTATION_STORAGE_KEY)));
      setIsAutoRotationPaused(window.localStorage.getItem(TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY) === "true");
      syncViewportMetrics();
    });
    window.addEventListener("resize", syncViewportMetrics);
    window.addEventListener("orientationchange", syncViewportMetrics);
    window.visualViewport?.addEventListener("resize", syncViewportMetrics);
    return () => {
      window.cancelAnimationFrame(restoreOrientation);
      window.removeEventListener("resize", syncViewportMetrics);
      window.removeEventListener("orientationchange", syncViewportMetrics);
      window.visualViewport?.removeEventListener("resize", syncViewportMetrics);
    };
  }, [syncViewportMetrics]);

  useEffect(() => {
    if (isAutoRotationPaused) return;
    let slideshowTimer = 0;
    const duration = isScreensaverVisible ? tabletScreensaverDurationMs : tabletPageDurationMs;
    const scheduleSlideshow = () => {
      slideshowTimer = window.setTimeout(() => {
        if (document.visibilityState !== "visible") {
          scheduleSlideshow();
          return;
        }
        setIsScreensaverVisible((isVisible) => !isVisible);
      }, duration);
    };
    scheduleSlideshow();
    return () => window.clearTimeout(slideshowTimer);
  }, [activeView, isAutoRotationPaused, isScreensaverVisible]);

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
    <main className={`tablet-kiosk-viewport ${isCssRotated ? "is-css-rotated" : ""}`} style={viewportStyle}>
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
            <button
              type="button"
              className={`tablet-rotation-toggle ${isAutoRotationPaused ? "is-paused" : ""}`}
              onClick={toggleAutoRotation}
              aria-label={isAutoRotationPaused ? "Resume automatic slideshow" : "Pause automatic slideshow"}
              aria-pressed={isAutoRotationPaused}
              title={isAutoRotationPaused ? "Resume automatic slideshow" : "Pause slideshow · 60s page / 15s lockscreen"}
            >
              {isAutoRotationPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>
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
              onTasksChange={updateLiveTasks}
              statusAliases={tabletPipelineStatusAliases}
              variant="tablet"
              visibleStatusKeys={tabletPipelineStatusKeys}
            />
          ) : <TabletCalendar jobs={calendarJobs} tasks={calendarTasks} campaignAssets={calendarCampaignAssets} customEvents={calendarEvents} today={today} />}
        </section>

        {isScreensaverVisible ? (
          <section className="tablet-kiosk-screensaver" data-testid="kiosk-screensaver" aria-label="TruShot Media studio overview">
            <div className="tablet-screensaver-topline">
              <span><i /> TruShot Media · Brisbane</span>
              <button type="button" onClick={() => setIsScreensaverVisible(false)}>
                Return to {activeView} <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="tablet-screensaver-hero">
              <Image src="/brand/logo-white.png" alt="TruShot Media" width={2000} height={744} priority sizes="(max-width: 800px) 72vw, 680px" />
              <p>Studio overview</p>
              <strong suppressHydrationWarning>{timeFormatter.format(now)}</strong>
              <time suppressHydrationWarning>{lockscreenDateFormatter.format(now)}</time>
            </div>

            <div className="tablet-screensaver-summary" aria-label="Studio summary">
              <article>
                <span><Bell size={15} /> Inbox</span>
                <strong>{pendingRequestCount}</strong>
                <small>Awaiting review</small>
              </article>
              <article>
                <span><BriefcaseBusiness size={15} /> Jobs outstanding</span>
                <strong>{kioskSummary.jobs}</strong>
                <small>With open assets</small>
              </article>
              <article>
                <span><ListChecks size={15} /> Tasks outstanding</span>
                <strong>{kioskSummary.tasks}</strong>
                <small>Still in production</small>
              </article>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
