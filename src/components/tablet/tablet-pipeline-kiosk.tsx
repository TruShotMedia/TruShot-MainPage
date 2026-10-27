"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, CalendarPlus2, LayoutDashboard, ListChecks, ListTodo, Moon, Pause, Pencil, Plane, Play, Plus, RectangleHorizontal, RectangleVertical, RefreshCw, Rows3, SunMedium, X } from "lucide-react";
import { PipelineBoard } from "@/components/admin/pipeline-board";
import { NotionAutoSync } from "@/components/admin/notion-auto-sync";
import { AutopacificSignOutButton } from "@/components/autopacific/autopacific-session-controls";
import { useWorkspaceTabTitle } from "@/components/autopacific/use-workspace-tab-title";
import { TabletCalendar } from "@/components/tablet/tablet-calendar";
import { TabletJobPipeline } from "@/components/tablet/tablet-job-pipeline";
import { TabletNotificationControl } from "@/components/tablet/tablet-notification-control";
import { TabletToday } from "@/components/tablet/tablet-today";
import type { TabletCreateKind } from "@/components/tablet/tablet-workspace-editors";
import {
  queueAutopacificOfflineMutation,
  readAutopacificOfflineQueue,
  removeAutopacificOfflineMutations,
  writeAutopacificOfflineSnapshot,
  type AutopacificOfflineMutation,
} from "@/lib/autopacific-offline";
import { parseTabletOrientation, TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY, TABLET_ORIENTATION_STORAGE_KEY, TABLET_VIEW_COOKIE_NAME, type TabletOrientation, type TabletView } from "@/lib/tablet-view";
import { workspaceInitialView, type WorkspaceMode } from "@/lib/workspace-mode";
import type { CalendarCampaignAsset, CalendarCustomEvent, CalendarFlightEvent, CalendarItem, CalendarJob, CalendarTask, JobSearchOption, JobStatus, PipelineTask, SelectOption, TabletJobRecord, TaskStatus } from "@/lib/types";

const tabletPipelineStatusKeys = ["not_started", "in_progress", "ready_for_revision", "final_draft_notes"];
const tabletPipelineStatusAliases = { ready_to_post: "final_draft_notes" };
const tabletPageDurationMs = 60_000;
const tabletScreensaverDurationMs = 15_000;

const tabletViewCopy: Record<TabletView, { eyebrow: string; title: string }> = {
  jobs: { eyebrow: "Production workflow", title: "Jobs" },
  planning: { eyebrow: "Ideas & upcoming work", title: "Planning" },
  pipeline: { eyebrow: "Asset workflow", title: "Tasks" },
  calendar: { eyebrow: "Schedule", title: "Calendar" },
  today: { eyebrow: "Daily briefing", title: "Today" },
};

type TabletKioskBranding = {
  calendarAccentColor?: string;
  calendarAccentClientName?: string;
  calendarAccentKeywords?: string[];
  calendarCompletedColor?: string;
  calendarMutedColor?: string;
  calendarOverdueColor?: string;
  logoAlt: string;
  logoHeight: number;
  logoSrc: string;
  logoSurface?: "light";
  logoWidth: number;
  screensaverLogo?: {
    alt: string;
    height: number;
    src: string;
    surface?: "light";
    width: number;
  };
  name: string;
  location: string;
  theme?: "autopacific";
};

const defaultTabletKioskBranding: TabletKioskBranding = {
  logoAlt: "TruShot Media",
  logoHeight: 744,
  logoSrc: "/brand/logo-white.png",
  logoWidth: 2000,
  name: "TruShot Media",
  location: "Brisbane",
};

const CalendarEventEditor = dynamic(() => import("@/components/admin/calendar-event-editor").then((module) => module.CalendarEventEditor));
const FlightEventEditor = dynamic(() => import("@/components/tablet/flight-event-editor").then((module) => module.FlightEventEditor));
const TabletRecordCreateEditor = dynamic(() => import("@/components/tablet/tablet-workspace-editors").then((module) => module.TabletRecordCreateEditor));
const TabletRecordEditEditor = dynamic(() => import("@/components/tablet/tablet-workspace-editors").then((module) => module.TabletRecordEditEditor));
const TabletJobDetailSheet = dynamic(() => import("@/components/tablet/tablet-workspace-editors").then((module) => module.TabletJobDetailSheet));
const TabletTaskDetailSheet = dynamic(() => import("@/components/tablet/tablet-workspace-editors").then((module) => module.TabletTaskDetailSheet));
const TabletScheduleEditor = dynamic(() => import("@/components/tablet/tablet-workspace-editors").then((module) => module.TabletScheduleEditor));

const timeFormatter = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Brisbane",
});

const timeKeyFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
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

type TabletScheduleSnapshot = Pick<{
  calendarCampaignAssets: CalendarCampaignAsset[];
  calendarEvents: CalendarCustomEvent[];
  calendarJobs: CalendarJob[];
  calendarTasks: CalendarTask[];
  flightEvents: CalendarFlightEvent[];
}, "calendarCampaignAssets" | "calendarEvents" | "calendarJobs" | "calendarTasks" | "flightEvents"> & { version: string };

type AutopacificTabPayload =
  | {
    kind: "jobs";
    jobStatuses: JobStatus[];
    pipelineJobs: TabletJobRecord[];
  }
  | {
    kind: "tasks";
    pipelineTasks: PipelineTask[];
    statuses: TaskStatus[];
  }
  | ({ kind: "schedule" } & Omit<TabletScheduleSnapshot, "version">);

function scheduleVersionFor(snapshot: Omit<TabletScheduleSnapshot, "version">) {
  return [
    ...snapshot.calendarJobs.map((item) => `job:${item.id}:${item.status_label}:${item.status_color}:${item.is_complete}`),
    ...snapshot.calendarTasks.map((item) => `task:${item.id}:${item.status_label}:${item.status_color}:${item.is_complete}`),
    ...snapshot.calendarCampaignAssets.map((item) => `campaign:${item.id}:${item.status_label}:${item.status_color}:${item.is_complete}`),
    ...snapshot.calendarEvents.map((item) => `event:${item.id}:${item.updated_at}`),
    ...snapshot.flightEvents.map((item) => `flight:${item.id}:${item.updated_at}`),
  ].join("|");
}

function jobsVersionFor(jobs: TabletJobRecord[]) {
  return jobs.map((job) => `${job.id}:${job.status_id}:${job.updated_at}:${job.open_tasks}:${job.total_tasks}`).join("|");
}

function TabletViewTabs({
  activeView,
  className,
  label,
  onSelect,
  showTodayView,
  isMarketing = false,
}: {
  activeView: TabletView;
  className: string;
  label: string;
  onSelect: (view: TabletView) => void;
  showTodayView: boolean;
  isMarketing?: boolean;
}) {
  return (
    <nav className={`tablet-kiosk-tabs ${className}`} aria-label={label} style={{ gridTemplateColumns: `repeat(${!isMarketing && showTodayView ? 4 : 3}, minmax(0, 1fr))` }}>
      <button type="button" className={activeView === "jobs" ? "is-active" : ""} onClick={() => onSelect("jobs")} aria-current={activeView === "jobs" ? "page" : undefined}><BriefcaseBusiness size={15} /> Jobs</button>
      <button type="button" className={activeView === "pipeline" ? "is-active" : ""} onClick={() => onSelect("pipeline")} aria-current={activeView === "pipeline" ? "page" : undefined}><Rows3 size={15} /> Tasks</button>
      <button type="button" className={activeView === "calendar" ? "is-active" : ""} onClick={() => onSelect("calendar")} aria-current={activeView === "calendar" ? "page" : undefined}><CalendarDays size={15} /> Calendar</button>
      {!isMarketing && showTodayView ? <button type="button" className={activeView === "today" ? "is-active" : ""} onClick={() => onSelect("today")} aria-current={activeView === "today" ? "page" : undefined}><SunMedium size={15} /> Today</button> : null}
    </nav>
  );
}

type TabletViewportMetrics = {
  height: number;
  orientation: TabletOrientation;
  width: number;
};

type TabletRecordCreateRequest = {
  date: string;
  kind: Exclude<TabletCreateKind, "event" | "flight">;
  sourceRecord?: TabletJobRecord | PipelineTask;
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
  initialJobId,
  workspaceMode = "production",
  canOpenCrm = true,
  calendarJobs,
  calendarTasks,
  calendarCampaignAssets = [],
  calendarEvents = [],
  calendarEventClientId = null,
  flightEvents = [],
  calendarDensity = "standard",
  branding = defaultTabletKioskBranding,
  experience = "kiosk",
  clientOptions = [],
  initialNow,
  initialStatuses,
  initialTasks,
  initialView,
  jobOptions = [],
  jobStatuses = [],
  pipelineJobs = [],
  pendingRequestCount,
  pipelineVersion,
  notificationPublicKey = "",
  notionSyncEnabled,
  notionSyncIntervalMinutes,
  refreshIntervalMinutes,
  showTodayView = false,
  today,
}: {
  workspaceMode?: WorkspaceMode;
  initialJobId?: string;
  canOpenCrm?: boolean;
  calendarJobs: CalendarJob[];
  calendarTasks: CalendarTask[];
  calendarCampaignAssets?: CalendarCampaignAsset[];
  calendarEvents?: CalendarCustomEvent[];
  calendarEventClientId?: string | null;
  flightEvents?: CalendarFlightEvent[];
  calendarDensity?: "standard" | "capacity";
  branding?: TabletKioskBranding;
  experience?: "kiosk" | "mobile";
  clientOptions?: SelectOption[];
  initialNow: string;
  initialStatuses: TaskStatus[];
  initialTasks: PipelineTask[];
  initialView: TabletView;
  jobOptions?: JobSearchOption[];
  jobStatuses?: JobStatus[];
  pipelineJobs?: TabletJobRecord[];
  pendingRequestCount: number;
  pipelineVersion: string;
  notificationPublicKey?: string;
  notionSyncEnabled: boolean;
  notionSyncIntervalMinutes: number;
  refreshIntervalMinutes: number;
  showTodayView?: boolean;
  today: string;
}) {
  const router = useRouter();
  const isMarketing = workspaceMode === "marketing";
  const [showPlanning,setShowPlanning]=useState(initialView === "planning");
  const jobStatusVersion = useMemo(() => jobStatuses.map((status) => `${status.id}:${status.key}:${status.position}:${status.is_closed}`).join("|"), [jobStatuses]);
  const taskStatusVersion = useMemo(() => initialStatuses.map((status) => `${status.id}:${status.key}:${status.position}:${status.is_open}`).join("|"), [initialStatuses]);
  const [selectedView, setActiveView] = useState<TabletView>(workspaceInitialView(initialView, workspaceMode, showTodayView));
  const activeView = workspaceInitialView(selectedView, workspaceMode, showTodayView);
  useWorkspaceTabTitle(workspaceMode, activeView, showPlanning ? "planning" : "active", branding.theme === "autopacific" || isMarketing);
  const [editingEnabled, setIsEditing] = useState(false);
  const isEditing = isMarketing || editingEnabled;
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState<TabletRecordCreateRequest | null>(null);
  const [eventEditorDate, setEventEditorDate] = useState<string | null>(null);
  const [flightEditorDate, setFlightEditorDate] = useState<string | null>(null);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<CalendarCustomEvent | null>(null);
  const [selectedFlightEvent, setSelectedFlightEvent] = useState<CalendarFlightEvent | null>(null);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState<CalendarItem | null>(null);
  const [selectedJob, setSelectedJob] = useState<TabletJobRecord | null>(null);
  const [viewingJob, setViewingJob] = useState<TabletJobRecord | null>(()=>pipelineJobs.find(job=>job.id===initialJobId)??null);
  const [selectedTask, setSelectedTask] = useState<PipelineTask | null>(null);
  const [viewingTask, setViewingTask] = useState<PipelineTask | null>(null);
  const [colorMode, setColorMode] = useState<"dark" | "light">("dark");
  const [isAutoRotationPaused, setIsAutoRotationPaused] = useState(false);
  const [isScreensaverVisible, setIsScreensaverVisible] = useState(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [liveTaskSnapshot, setLiveTaskSnapshot] = useState(() => ({ pipelineVersion, tasks: initialTasks }));
  const [liveJobSnapshot, setLiveJobSnapshot] = useState(() => ({ jobs: pipelineJobs, version: jobsVersionFor(pipelineJobs) }));
  const [liveJobStatusSnapshot, setLiveJobStatusSnapshot] = useState(() => ({ statuses: jobStatuses, version: jobStatusVersion }));
  const [liveTaskStatusSnapshot, setLiveTaskStatusSnapshot] = useState(() => ({ statuses: initialStatuses, version: taskStatusVersion }));
  const [liveScheduleSnapshot, setLiveScheduleSnapshot] = useState<TabletScheduleSnapshot>(() => {
    const snapshot = { calendarCampaignAssets, calendarEvents, calendarJobs, calendarTasks, flightEvents };
    return { ...snapshot, version: scheduleVersionFor(snapshot) };
  });
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<AutopacificOfflineMutation[]>([]);
  const [offlineNotice, setOfflineNotice] = useState("");
  const offlineSyncInFlight = useRef(false);
  const tabETags = useRef(new Map<"jobs" | "tasks" | "schedule", string>());
  const tabRefreshInFlight = useRef(new Set<"jobs" | "tasks" | "schedule">());
  const [now, setNow] = useState(() => new Date(initialNow));
  const [preferredOrientation, setPreferredOrientation] = useState<TabletOrientation | null>(null);
  const [currentViewportOrientation, setCurrentViewportOrientation] = useState<TabletOrientation | null>(null);
  const [viewportSize, setViewportSize] = useState<{ height: number; width: number } | null>(null);
  const lastRefreshAt = useRef(new Date(initialNow).getTime());
  const refreshIntervalMs = refreshIntervalMinutes * 60_000;
  const liveTasks = liveTaskSnapshot.pipelineVersion === pipelineVersion ? liveTaskSnapshot.tasks : initialTasks;
  const jobPipelineVersion = useMemo(() => jobsVersionFor(pipelineJobs), [pipelineJobs]);
  const liveJobs = liveJobSnapshot.version === jobPipelineVersion ? liveJobSnapshot.jobs : pipelineJobs;
  const liveJobStatuses = liveJobStatusSnapshot.version === jobStatusVersion ? liveJobStatusSnapshot.statuses : jobStatuses;
  const liveTaskStatuses = liveTaskStatusSnapshot.version === taskStatusVersion ? liveTaskStatusSnapshot.statuses : initialStatuses;
  const incomingSchedule = useMemo(() => ({ calendarCampaignAssets, calendarEvents, calendarJobs, calendarTasks, flightEvents }), [calendarCampaignAssets, calendarEvents, calendarJobs, calendarTasks, flightEvents]);
  const scheduleVersion = useMemo(() => scheduleVersionFor(incomingSchedule), [incomingSchedule]);
  const liveSchedule = useMemo(() => (
    liveScheduleSnapshot.version === scheduleVersion
      ? liveScheduleSnapshot
      : { ...incomingSchedule, version: scheduleVersion }
  ), [incomingSchedule, liveScheduleSnapshot, scheduleVersion]);
  const isDedicatedMobile = experience === "mobile";
  const colorModeStorageKey = branding.theme === "autopacific" ? "autopacific-color-mode" : "tablet-color-mode";
  const isMobileViewport = isDedicatedMobile || Boolean(viewportSize && Math.min(viewportSize.width, viewportSize.height) <= 760);
  const effectiveOrientation = isDedicatedMobile
    ? "portrait"
    : isMobileViewport
    ? currentViewportOrientation ?? "portrait"
    : preferredOrientation ?? currentViewportOrientation ?? "landscape";
  const isCssRotated = Boolean(!isDedicatedMobile && !isMobileViewport && preferredOrientation && currentViewportOrientation && preferredOrientation !== currentViewportOrientation);
  const screensaverLogo = branding.screensaverLogo ?? {
    alt: branding.logoAlt,
    height: branding.logoHeight,
    src: branding.logoSrc,
    surface: branding.logoSurface,
    width: branding.logoWidth,
  };
  const kioskSummary = useMemo(() => {
    const openStatusIds = new Set(liveTaskStatuses.filter((status) => status.is_open).map((status) => status.id));
    const outstandingTasks = liveTasks.filter((task) => openStatusIds.has(task.status_id));
    return {
      jobs: new Set(outstandingTasks.map((task) => task.job_id).filter(Boolean)).size,
      tasks: outstandingTasks.length,
    };
  }, [liveTaskStatuses, liveTasks]);
  const viewportStyle = viewportSize && !isMobileViewport && !isDedicatedMobile ? {
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
    if (!navigator.onLine) {
      setIsOnline(false);
      setOfflineNotice("Still offline—the last saved AutoPacific workspace remains available.");
      return;
    }
    setIsOnline(true);
    lastRefreshAt.current = Date.now();
    router.refresh();
  }, [router]);

  const refreshTab = useCallback(async (view: TabletView) => {
    if (!navigator.onLine) {
      setIsOnline(false);
      setOfflineNotice("Still offline—the last saved AutoPacific workspace remains available.");
      return;
    }

    const tab = view === "jobs" || view === "planning" ? "jobs" : view === "pipeline" ? "tasks" : "schedule";
    if (tabRefreshInFlight.current.has(tab)) return;
    tabRefreshInFlight.current.add(tab);
    setIsOnline(true);

    try {
      const headers = new Headers();
      const eTag = tabETags.current.get(tab);
      if (eTag) headers.set("If-None-Match", eTag);
      const response = await fetch(`/api/autopacific/tab?view=${tab}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers,
      });
      lastRefreshAt.current = Date.now();
      if (response.status === 304) return;
      if (!response.ok) throw new Error("The latest workspace data is unavailable.");

      const responseETag = response.headers.get("etag");
      if (responseETag) tabETags.current.set(tab, responseETag);
      const payload = await response.json() as AutopacificTabPayload;
      if (payload.kind === "jobs") {
        setLiveJobSnapshot({ jobs: payload.pipelineJobs, version: jobPipelineVersion });
        setLiveJobStatusSnapshot({ statuses: payload.jobStatuses, version: jobStatusVersion });
      } else if (payload.kind === "tasks") {
        setLiveTaskSnapshot({ pipelineVersion, tasks: payload.pipelineTasks });
        setLiveTaskStatusSnapshot({ statuses: payload.statuses, version: taskStatusVersion });
      } else {
        const snapshot = {
          calendarCampaignAssets: payload.calendarCampaignAssets,
          calendarEvents: payload.calendarEvents,
          calendarJobs: payload.calendarJobs,
          calendarTasks: payload.calendarTasks,
          flightEvents: payload.flightEvents,
        };
        // The parent payload is intentionally not changed by a targeted fetch.
        // Pair the latest schedule with its current parent version so it renders
        // immediately; the next server refresh replaces it with its live source.
        setLiveScheduleSnapshot({ ...snapshot, version: scheduleVersion });
      }
      if (!offlineQueue.length) setOfflineNotice("");
    } catch {
      setOfflineNotice("The latest field data could not be reached. Your last saved workspace remains intact.");
    } finally {
      tabRefreshInFlight.current.delete(tab);
    }
  }, [jobPipelineVersion, jobStatusVersion, offlineQueue.length, pipelineVersion, scheduleVersion, taskStatusVersion]);

  const refreshActiveTab = useCallback(() => {
    void refreshTab(activeView);
  }, [activeView, refreshTab]);

  const selectView = useCallback((view: TabletView) => {
    setActiveView(view);
    setIsScreensaverVisible(false);
    setIsMobileActionsOpen(false);
    setIsCreateMenuOpen(false);
    setViewingJob(null);
    setViewingTask(null);
    document.cookie = `${isMarketing ? "autopacific-marketing-view" : TABLET_VIEW_COOKIE_NAME}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`;
    void refreshTab(view);
  }, [isMarketing, refreshTab]);

  const updateLiveTasks = useCallback((tasks: PipelineTask[]) => {
    setLiveTaskSnapshot({ pipelineVersion, tasks });
  }, [pipelineVersion]);

  const updateLiveJobs = useCallback((jobs: TabletJobRecord[]) => {
    setLiveJobSnapshot({ jobs, version: jobPipelineVersion });
  }, [jobPipelineVersion]);

  const queueOfflineMove = useCallback((entity: "job" | "task", mutation: { expectedUpdatedAt: string; recordId: string; statusId: string; title: string }) => {
    const queue = queueAutopacificOfflineMutation({ entity, ...mutation });
    setOfflineQueue(queue);
    setOfflineNotice(`${queue.length} field ${queue.length === 1 ? "change is" : "changes are"} waiting to sync.`);
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (offlineSyncInFlight.current || !navigator.onLine) return;
    const pending = readAutopacificOfflineQueue();
    if (!pending.length) {
      setOfflineQueue([]);
      return;
    }

    offlineSyncInFlight.current = true;
    try {
      const response = await fetch("/api/autopacific/offline-sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutations: pending }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; results?: Array<{ clientMutationId: string; status: "synced" | "conflict" | "rejected" }> } | null;
      if (!response.ok || !payload?.results) throw new Error(payload?.error ?? "The connection is not ready to sync yet.");

      const settled = payload.results.filter((result) => result.status !== "rejected");
      const queue = removeAutopacificOfflineMutations(settled.map((result) => result.clientMutationId));
      setOfflineQueue(queue);
      const conflicts = settled.filter((result) => result.status === "conflict").length;
      setOfflineNotice(conflicts
        ? `${conflicts} queued ${conflicts === 1 ? "change needs" : "changes need"} review—newer live data was kept.`
        : queue.length
          ? `${queue.length} field ${queue.length === 1 ? "change remains" : "changes remain"} queued.`
          : "Offline field changes are now live.");
      refresh();
    } catch {
      // Keep the queue intact. The next browser online event or manual refresh
      // will retry without ever overwriting a live revision.
      setOfflineNotice("Field changes are still safely queued until reception returns.");
    } finally {
      offlineSyncInFlight.current = false;
    }
  }, [refresh]);

  const toggleAutoRotation = useCallback(() => {
    setIsAutoRotationPaused((isPaused) => {
      const nextPaused = !isPaused;
      window.localStorage.setItem(TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY, String(nextPaused));
      if (nextPaused) setIsScreensaverVisible(false);
      return nextPaused;
    });
  }, []);

  const toggleEditing = useCallback(() => {
    setIsEditing((current) => {
      const next = !current;
      setIsScreensaverVisible(false);
      setIsMobileActionsOpen(false);
      setIsCreateMenuOpen(false);
      setViewingJob(null);
      setViewingTask(null);
      if (!next) {
        setCreateRequest(null);
        setEventEditorDate(null);
        setFlightEditorDate(null);
        setSelectedCalendarEvent(null);
        setSelectedFlightEvent(null);
        setSelectedScheduleItem(null);
        setSelectedJob(null);
        setSelectedTask(null);
      }
      return next;
    });
  }, []);

  const openCreate = useCallback((kind: TabletCreateKind, date?: string) => {
    if (isMarketing && (kind === "task" || kind === "flight")) return;
    const creationDate = date ?? (kind === "job" && (!isMarketing || activeView === "planning") ? "" : today);
    setIsCreateMenuOpen(false);
    setViewingJob(null);
    setViewingTask(null);
    setSelectedScheduleItem(null);
    setSelectedJob(null);
    setSelectedTask(null);
    setSelectedFlightEvent(null);
    setFlightEditorDate(null);
    if (kind === "event") {
      setCreateRequest(null);
      setSelectedCalendarEvent(null);
      setEventEditorDate(creationDate);
      return;
    }
    if (kind === "flight") {
      setCreateRequest(null);
      setEventEditorDate(null);
      setSelectedCalendarEvent(null);
      setFlightEditorDate(creationDate);
      return;
    }
    setEventEditorDate(null);
    setSelectedCalendarEvent(null);
    setCreateRequest({ date: creationDate, kind });
  }, [activeView, isMarketing, today]);

  const closeEventEditor = useCallback(() => {
    setEventEditorDate(null);
    setSelectedCalendarEvent(null);
  }, []);

  const closeFlightEditor = useCallback(() => {
    setFlightEditorDate(null);
    setSelectedFlightEvent(null);
  }, []);

  const openDuplicateRecord = useCallback((kind: TabletRecordCreateRequest["kind"], sourceRecord: TabletJobRecord | PipelineTask) => {
    setIsCreateMenuOpen(false);
    setViewingJob(null);
    setViewingTask(null);
    setSelectedScheduleItem(null);
    setSelectedJob(null);
    setSelectedTask(null);
    setSelectedCalendarEvent(null);
    setSelectedFlightEvent(null);
    setEventEditorDate(null);
    setFlightEditorDate(null);
    const date = kind === "job" && "shoot_date" in sourceRecord ? sourceRecord.shoot_date ?? "" : today;
    setCreateRequest({ date, kind, sourceRecord });
  }, [today]);

  const handleMutationSaved = useCallback(() => {
    setCreateRequest(null);
    setViewingJob(null);
    setViewingTask(null);
    setSelectedScheduleItem(null);
    setSelectedJob(null);
    setSelectedTask(null);
    closeEventEditor();
    closeFlightEditor();
    void refreshTab(activeView);
    refresh();
  }, [activeView, closeEventEditor, closeFlightEditor, refresh, refreshTab]);

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
    document.documentElement.classList.add("tablet-kiosk-active");
    document.body.classList.add("tablet-kiosk-active");
    return () => {
      document.documentElement.classList.remove("tablet-kiosk-active");
      document.body.classList.remove("tablet-kiosk-active");
    };
  }, []);

  useEffect(() => {
    const storedMode = window.localStorage.getItem(colorModeStorageKey);
    if (storedMode !== "light" && storedMode !== "dark") return;
    // Defer the persisted preference restore until after the initial paint. Apart
    // from avoiding an SSR/client mismatch, this keeps React from treating the
    // restore as a synchronous state update caused by the effect itself.
    const restore = window.setTimeout(() => setColorMode(storedMode), 0);
    return () => window.clearTimeout(restore);
  }, [colorModeStorageKey]);

  useEffect(() => {
    document.documentElement.dataset.tabletColorMode = colorMode;
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = themeMeta?.content;
    if (themeMeta) themeMeta.content = colorMode === "light" ? "#eef4f6" : "#061017";
    return () => {
      delete document.documentElement.dataset.tabletColorMode;
      if (themeMeta && previousThemeColor) themeMeta.content = previousThemeColor;
    };
  }, [colorMode]);

  useEffect(() => {
    const restoreOrientation = window.requestAnimationFrame(() => {
      if (!isDedicatedMobile) setPreferredOrientation(parseTabletOrientation(window.localStorage.getItem(TABLET_ORIENTATION_STORAGE_KEY)));
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
  }, [isDedicatedMobile, syncViewportMetrics]);

  useEffect(() => {
    const restoreFieldState = window.requestAnimationFrame(() => {
      setOfflineQueue(readAutopacificOfflineQueue());
      setIsOnline(navigator.onLine);
    });

    const handleOnline = () => {
      setIsOnline(true);
      void syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setOfflineNotice("Offline field mode is active. Status changes will queue safely on this device.");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.cancelAnimationFrame(restoreFieldState);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncOfflineQueue]);

  useEffect(() => {
    const snapshot = {
      calendarCampaignAssets: liveSchedule.calendarCampaignAssets,
      calendarEvents: liveSchedule.calendarEvents,
      calendarJobs: liveSchedule.calendarJobs,
      calendarTasks: liveSchedule.calendarTasks,
      flightEvents: liveSchedule.flightEvents,
      jobStatuses: liveJobStatuses,
      pipelineJobs: liveJobs,
      pipelineTasks: liveTasks,
      statuses: liveTaskStatuses,
    };
    writeAutopacificOfflineSnapshot(snapshot);
  }, [liveJobStatuses, liveJobs, liveSchedule, liveTaskStatuses, liveTasks]);

  useEffect(() => {
    if (isMarketing || isAutoRotationPaused || isEditing || isMobileViewport) return;
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
  }, [activeView, isAutoRotationPaused, isEditing, isMarketing, isMobileViewport, isScreensaverVisible]);

  useEffect(() => {
    if (!isMobileActionsOpen && !isCreateMenuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMobileActionsOpen(false);
      setIsCreateMenuOpen(false);
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [isCreateMenuOpen, isMobileActionsOpen]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 15_000);
    const refreshIfAvailable = () => {
      if ((isEditing && !isMarketing) || createRequest || selectedJob || selectedTask || selectedScheduleItem || eventEditorDate || flightEditorDate || document.visibilityState !== "visible" || !navigator.onLine) return;
      refreshActiveTab();
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
  }, [createRequest, eventEditorDate, flightEditorDate, isEditing, isMarketing, selectedJob, selectedTask, selectedScheduleItem, refreshActiveTab, refreshIntervalMs]);

  return (
    <main className={`tablet-kiosk-viewport ${isDedicatedMobile ? "is-dedicated-mobile" : ""} ${isCssRotated ? "is-css-rotated" : ""} is-${colorMode}`} style={viewportStyle}>
      <div className={`tablet-kiosk ${isMarketing ? "is-marketing" : ""} ${branding.theme ? `theme-${branding.theme}` : ""} ${isDedicatedMobile ? "is-dedicated-mobile" : ""} ${isEditing ? "is-editing" : "is-read-only"} is-${colorMode}`} data-orientation={effectiveOrientation} data-experience={experience}>
        <NotionAutoSync enabled={notionSyncEnabled} intervalMinutes={notionSyncIntervalMinutes} />
        <header className="tablet-kiosk-header">
          <div className="tablet-kiosk-identity">
            <span className={`tablet-kiosk-brandmark ${branding.logoSurface === "light" ? "is-light-backed" : ""}`}>
              <Image src={branding.logoSrc} alt={branding.logoAlt} width={branding.logoWidth} height={branding.logoHeight} priority />
            </span>
            <div className="tablet-kiosk-clock" aria-label={`Brisbane time ${timeFormatter.format(now)}`}>
              <strong suppressHydrationWarning>{timeFormatter.format(now)}</strong>
              <span suppressHydrationWarning>{dateFormatter.format(now)}</span>
            </div>
          </div>

          <TabletViewTabs isMarketing={isMarketing} activeView={activeView} className="tablet-kiosk-tabs-desktop" label="Tablet views" onSelect={selectView} showTodayView={showTodayView} />

          <div className="tablet-kiosk-actions">
            {!isMarketing ? <button type="button" className={`tablet-edit-toggle ${isEditing ? "is-active" : ""}`} onClick={toggleEditing} aria-label={isEditing ? "Turn off tablet editing" : "Turn on tablet editing"} aria-pressed={isEditing} title={isEditing ? "Detail editing on · tap to return to kiosk mode" : "Detail editing off · drag and completion controls remain available"}><Pencil size={15} /></button> : null}
            {!isMarketing && notificationPublicKey ? <TabletNotificationControl experience={branding.theme === "autopacific" ? "autopacific" : "trushot"} experienceName={branding.name} publicKey={notificationPublicKey} /> : null}
            {!isMarketing ? <button
              type="button"
              className={`tablet-slideshow-toggle ${isAutoRotationPaused ? "is-paused" : ""}`}
              onClick={toggleAutoRotation}
              aria-label={isAutoRotationPaused ? "Resume automatic slideshow" : "Pause automatic slideshow"}
              aria-pressed={isAutoRotationPaused}
              title={isAutoRotationPaused ? "Resume automatic slideshow" : "Pause slideshow · 60s page / 15s lockscreen"}
            >
              {isAutoRotationPaused ? <Play size={14} /> : <Pause size={14} />}
            </button> : null}
            <button type="button" className="tablet-orientation-toggle" onClick={rotateOrientation} aria-label={`Switch kiosk to ${effectiveOrientation === "landscape" ? "portrait" : "landscape"}`} title={`Switch to ${effectiveOrientation === "landscape" ? "portrait" : "landscape"}`}>
              {effectiveOrientation === "landscape" ? <RectangleVertical size={15} /> : <RectangleHorizontal size={15} />}
            </button>
            <button type="button" className="tablet-refresh-button" onClick={refreshActiveTab} aria-label="Refresh the current workspace tab" title="Refresh current view"><RefreshCw size={15} /></button>
            {!isMarketing && canOpenCrm ? <Link className="tablet-crm-button" href="/admin"><LayoutDashboard size={15} /> CRM</Link> : null}
            {branding.theme === "autopacific" ? <AutopacificSignOutButton destination={isMarketing ? "/marketing" : "/autopacific"} /> : null}
            <button
              type="button"
              className="tablet-theme-toggle"
              onClick={() => setColorMode((current) => {
                const next = current === "dark" ? "light" : "dark";
                window.localStorage.setItem(colorModeStorageKey, next);
                return next;
              })}
              aria-label={`Switch to ${colorMode === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${colorMode === "dark" ? "light" : "dark"} mode`}
            >
              {colorMode === "dark" ? <SunMedium size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {!isOnline || offlineQueue.length || offlineNotice ? (
          <p className={`tablet-offline-status ${isOnline ? "is-online" : "is-offline"}`} role="status">
            <i />
            <span>{!isOnline ? "Offline field mode" : offlineQueue.length ? "Syncing field changes" : "Field mode ready"}</span>
            <small>{offlineNotice || "Your latest authorised workspace copy is kept on this device."}</small>
          </p>
        ) : null}

        <TabletViewTabs isMarketing={isMarketing} activeView={activeView} className="tablet-kiosk-tabs-mobile" label="Mobile views" onSelect={selectView} showTodayView={showTodayView} />

        {isMobileActionsOpen ? (
          <>
            <button type="button" className="tablet-mobile-sheet-backdrop" onClick={() => setIsMobileActionsOpen(false)} aria-label="Close more controls" />
            <section className="tablet-mobile-actions-sheet" aria-label={`${branding.name} app controls`} role="dialog" aria-modal="true">
              <header>
                <div><span>Workspace controls</span><strong>{branding.name}</strong></div>
                <button type="button" onClick={() => setIsMobileActionsOpen(false)} aria-label="Close more controls"><X size={18} /></button>
              </header>
              <div>
                {!isMarketing ? <button type="button" onClick={() => { toggleAutoRotation(); setIsMobileActionsOpen(false); }}>
                  <span>{isAutoRotationPaused ? <Play size={18} /> : <Pause size={18} />}</span>
                  <strong>{isAutoRotationPaused ? "Resume kiosk display" : "Pause kiosk display"}<small>Control the automatic lockscreen on larger displays.</small></strong>
                </button> : null}
                {!isMobileViewport ? <button type="button" onClick={() => { rotateOrientation(); setIsMobileActionsOpen(false); }}>
                  <span>{effectiveOrientation === "landscape" ? <RectangleVertical size={18} /> : <RectangleHorizontal size={18} />}</span>
                  <strong>Change orientation<small>Switch between portrait and landscape layouts.</small></strong>
                </button> : null}
                <button type="button" onClick={() => { refreshActiveTab(); setIsMobileActionsOpen(false); }}>
                  <span><RefreshCw size={18} /></span>
                  <strong>Refresh workspace<small>Fetch the latest jobs, tasks and schedule.</small></strong>
                </button>
                {!isMarketing && canOpenCrm ? <Link href="/admin" onClick={() => setIsMobileActionsOpen(false)}>
                  <span><LayoutDashboard size={18} /></span>
                  <strong>Open TruShot CRM<small>Continue in the complete administration workspace.</small></strong>
                </Link> : null}
                {branding.theme === "autopacific" ? <AutopacificSignOutButton destination={isMarketing ? "/marketing" : "/autopacific"} showLabel /> : null}
              </div>
            </section>
          </>
        ) : null}

        <section className={`tablet-kiosk-main ${isMarketing && activeView === "planning" ? "marketing-planning-board" : ""}`} aria-label={activeView === "planning" ? "Marketing planning jobs" : activeView === "jobs" ? "Tablet job pipeline" : activeView === "pipeline" ? "Tablet asset pipeline" : activeView === "today" ? "Tablet today itinerary" : "Tablet production calendar"}>
          {isMarketing && activeView === "jobs" ? <div className="marketing-job-views"><button type="button" aria-pressed={!showPlanning} onClick={()=>setShowPlanning(false)}>Active jobs</button><button type="button" aria-pressed={showPlanning} onClick={()=>setShowPlanning(true)}>Planning</button></div> : null}
          <header className="tablet-mobile-view-heading">
            <div><span>{tabletViewCopy[activeView].eyebrow}</span><h1>{tabletViewCopy[activeView].title}</h1></div>
            <small className={isEditing ? "is-editing" : ""}><i /> {isEditing ? "Editing on" : "Live workspace"}</small>
          </header>
          {activeView === "jobs" || activeView === "planning" ? (
            <TabletJobPipeline
              visibleStatusKeys={isMarketing ? showPlanning ? ["planning"] : liveJobStatuses.filter((status) => status.key !== "planning").map((status) => status.key) : undefined}
              enableCompletion={!showPlanning}
              editable={isEditing}
              key={jobPipelineVersion}
              initialJobs={liveJobs}
              isOffline={!isOnline}
              statuses={liveJobStatuses}
              onDuplicateJob={(job) => openDuplicateRecord("job", job)}
              onEditJob={(job) => {
                setViewingJob(null);
                setViewingTask(null);
                setSelectedTask(null);
                setSelectedScheduleItem(null);
                closeEventEditor();
                setSelectedJob(job);
              }}
              onJobsChange={updateLiveJobs}
              onMoveSaved={() => void refreshTab("jobs")}
              onQueueMove={(mutation) => queueOfflineMove("job", mutation)}
              onViewJob={(job) => {
                setCreateRequest(null);
                setSelectedJob(null);
                setSelectedTask(null);
                setViewingTask(null);
                setSelectedScheduleItem(null);
                closeEventEditor();
                closeFlightEditor();
                setViewingJob(job);
              }}
            />
          ) : activeView === "pipeline" ? (
            <PipelineBoard
              editable={isEditing && !isMarketing}
              approvalOnly={isMarketing}
              isOffline={!isOnline}
              key={pipelineVersion}
              completionStatusKey="final_draft_notes"
              initialStatuses={isMarketing ? liveTaskStatuses.map(status=>status.key==="final_draft_notes"?{...status,label:"Review"}:status) : liveTaskStatuses}
              initialTasks={liveTasks}
              onDuplicateTask={isEditing && !isMarketing ? (task) => openDuplicateRecord("task", task) : undefined}
              onEditTask={isEditing && !isMarketing ? (task) => {
                setViewingTask(null);
                setSelectedJob(null);
                setSelectedScheduleItem(null);
                closeEventEditor();
                setSelectedTask(task);
              } : undefined}
              onViewTask={!isEditing || isMarketing ? (task) => {
                setCreateRequest(null);
                setViewingJob(null);
                setSelectedJob(null);
                setSelectedTask(null);
                setSelectedScheduleItem(null);
                closeEventEditor();
                closeFlightEditor();
                setViewingTask(task);
              } : undefined}
              onTasksChange={updateLiveTasks}
              onMoveSaved={() => void refreshTab("pipeline")}
              onQueueMove={(mutation) => queueOfflineMove("task", mutation)}
              statusAliases={isMarketing ? {...tabletPipelineStatusAliases,ready_for_revision:"final_draft_notes"} : tabletPipelineStatusAliases}
              variant="tablet"
              visibleStatusKeys={isMarketing ? ["not_started","in_progress","final_draft_notes"] : tabletPipelineStatusKeys}
              workflowEnabled={!isMarketing}
            />
          ) : activeView === "today" ? <TabletToday
            accentClientName={branding.calendarAccentClientName}
            accentKeywords={branding.calendarAccentKeywords}
            jobs={liveSchedule.calendarJobs}
            tasks={liveSchedule.calendarTasks}
            campaignAssets={isMarketing ? [] : liveSchedule.calendarCampaignAssets}
            customEvents={liveSchedule.calendarEvents}
            flightEvents={isMarketing ? [] : liveSchedule.flightEvents}
            editable={isEditing}
            onOpenCustomEvent={(event) => {
              setCreateRequest(null);
              setSelectedScheduleItem(null);
              setSelectedJob(null);
              setSelectedTask(null);
              setSelectedCalendarEvent(event);
              setEventEditorDate(event.start_date);
            }}
            onOpenFlight={(event) => {
              setCreateRequest(null);
              closeEventEditor();
              setSelectedScheduleItem(null);
              setSelectedJob(null);
              setSelectedTask(null);
              setSelectedFlightEvent(event);
              setFlightEditorDate(event.departure_date);
            }}
            onOpenItem={(item) => {
              setCreateRequest(null);
              closeEventEditor();
              if (item.entity_type === "job") {
                const fullJob = liveJobs.find((job) => job.id === item.id) ?? null;
                setSelectedTask(null);
                setSelectedScheduleItem(fullJob ? null : item);
                setSelectedJob(fullJob);
              } else if (item.entity_type === "task") {
                const fullTask = liveTasks.find((task) => task.id === item.id) ?? null;
                setSelectedJob(null);
                setSelectedScheduleItem(fullTask ? null : item);
                setSelectedTask(fullTask);
              } else {
                setSelectedJob(null);
                setSelectedTask(null);
                setSelectedScheduleItem(item);
              }
            }}
            today={today}
          /> : <TabletCalendar
            accentColor={branding.calendarAccentColor}
            accentClientName={branding.calendarAccentClientName}
            accentKeywords={branding.calendarAccentKeywords}
            completedColor={branding.calendarCompletedColor}
            currentTime={timeKeyFormatter.format(now)}
            mutedColor={branding.calendarMutedColor}
            overdueColor={branding.calendarOverdueColor}
            density={calendarDensity}
            jobs={liveSchedule.calendarJobs}
            tasks={liveSchedule.calendarTasks}
            campaignAssets={isMarketing ? [] : liveSchedule.calendarCampaignAssets}
            customEvents={liveSchedule.calendarEvents}
            flightEvents={isMarketing ? [] : liveSchedule.flightEvents}
            editable={isEditing}
            onCreateEvent={(date) => openCreate("event", date)}
            onEditEvent={(event) => {
              setCreateRequest(null);
              setSelectedScheduleItem(null);
              setSelectedJob(null);
              setSelectedTask(null);
              setSelectedCalendarEvent(event);
              setEventEditorDate(event.start_date);
            }}
            onEditFlight={(event) => {
              setCreateRequest(null);
              closeEventEditor();
              setSelectedScheduleItem(null);
              setSelectedJob(null);
              setSelectedTask(null);
              setSelectedFlightEvent(event);
              setFlightEditorDate(event.departure_date);
            }}
            onEditItem={(item) => {
              setCreateRequest(null);
              closeEventEditor();
              if(isMarketing&&item.entity_type!=="job") {const task=liveTasks.find(task=>task.id===item.id);if(task)setViewingTask(task);return;}
              if (item.entity_type === "job") {
                const fullJob = liveJobs.find((job) => job.id === item.id) ?? null;
                setSelectedTask(null);
                setSelectedScheduleItem(fullJob ? null : item);
                setSelectedJob(fullJob);
              } else if (item.entity_type === "task") {
                const fullTask = liveTasks.find((task) => task.id === item.id) ?? null;
                setSelectedJob(null);
                setSelectedScheduleItem(fullTask ? null : item);
                setSelectedTask(fullTask);
              } else {
                setSelectedJob(null);
                setSelectedTask(null);
                setSelectedScheduleItem(item);
              }
            }}
            today={today}
          />}
        </section>

        {isEditing ? (
          <div className={`tablet-create-dock ${isCreateMenuOpen ? "is-open" : ""}`} onMouseLeave={() => setIsCreateMenuOpen(false)}>
            {isCreateMenuOpen ? <button type="button" className="tablet-create-backdrop" onClick={() => setIsCreateMenuOpen(false)} aria-label="Close create menu" /> : null}
            <div className="tablet-create-options" aria-label="Create from tablet">
              <button type="button" onClick={() => openCreate("event")}><CalendarPlus2 size={15} /><span>Event</span></button>
              {!isMarketing ? <button type="button" onClick={() => openCreate("flight")}><Plane size={15} /><span>Flight</span></button> : null}
              <button type="button" onClick={() => openCreate("job")}><BriefcaseBusiness size={15} /><span>Job</span></button>
              {!isMarketing ? <button type="button" onClick={() => openCreate("task")}><ListTodo size={15} /><span>Task</span></button> : null}
            </div>
            <button type="button" className="tablet-create-trigger" onClick={() => setIsCreateMenuOpen((open) => !open)} aria-label={isMarketing ? "Create event or job" : "Create event, flight, job or task"} aria-expanded={isCreateMenuOpen}><Plus size={20} /></button>
          </div>
        ) : null}

        {createRequest ? <TabletRecordCreateEditor initialStatusId={isMarketing ? liveJobStatuses.find((status) => status.key === (showPlanning || !createRequest.date ? "planning" : "scheduled"))?.id : undefined} fixedClientId={branding.theme === "autopacific" ? calendarEventClientId ?? undefined : undefined} clientOptions={clientOptions} defaultDate={createRequest.date} jobOptions={jobOptions} jobStatuses={liveJobStatuses} kind={createRequest.kind} onClose={() => setCreateRequest(null)} onCreated={handleMutationSaved} sourceRecord={createRequest.sourceRecord} taskStatuses={liveTaskStatuses} /> : null}
        {viewingJob ? <TabletJobDetailSheet allowDeliverableTasks={branding.theme === "autopacific" && !isMarketing} isAutopacific={branding.theme === "autopacific"} job={liveJobs.find((job) => job.id === viewingJob.id) ?? viewingJob} onClose={() => setViewingJob(null)} /> : null}
        {viewingTask ? <TabletTaskDetailSheet task={viewingTask} onClose={() => setViewingTask(null)} /> : null}
        {selectedJob ? <TabletRecordEditEditor allowDeliverableTasks={branding.theme === "autopacific" && !isMarketing} fixedClientId={branding.theme === "autopacific" ? calendarEventClientId ?? undefined : undefined} clientOptions={clientOptions} jobOptions={jobOptions} jobStatuses={liveJobStatuses} onClose={() => setSelectedJob(null)} onSaved={handleMutationSaved} record={selectedJob} taskStatuses={liveTaskStatuses} type="job" /> : null}
        {selectedTask ? <TabletRecordEditEditor allowDeliverableTasks={branding.theme === "autopacific" && !isMarketing} fixedClientId={branding.theme === "autopacific" ? calendarEventClientId ?? undefined : undefined} clientOptions={clientOptions} jobOptions={jobOptions} jobStatuses={liveJobStatuses} onClose={() => setSelectedTask(null)} onSaved={handleMutationSaved} record={selectedTask} taskStatuses={liveTaskStatuses} type="task" /> : null}
        {selectedScheduleItem ? <TabletScheduleEditor item={selectedScheduleItem} onClose={() => setSelectedScheduleItem(null)} onSaved={handleMutationSaved} /> : null}
        {eventEditorDate ? <CalendarEventEditor defaultClientId={calendarEventClientId} key={selectedCalendarEvent?.id ?? `tablet-new-${eventEditorDate}`} event={selectedCalendarEvent} defaultDate={eventEditorDate} onClose={closeEventEditor} onDeleted={handleMutationSaved} onSaved={handleMutationSaved} /> : null}
        {!isMarketing && flightEditorDate ? <FlightEventEditor defaultClientId={calendarEventClientId} key={selectedFlightEvent?.id ?? `tablet-flight-new-${flightEditorDate}`} event={selectedFlightEvent} flightEvents={liveSchedule.flightEvents} defaultDate={flightEditorDate} onClose={closeFlightEditor} onDeleted={handleMutationSaved} onSaved={handleMutationSaved} /> : null}

        {!isMarketing && isScreensaverVisible ? (
          <section className="tablet-kiosk-screensaver" data-testid="kiosk-screensaver" aria-label={`${branding.name} overview`}>
            <div className="tablet-screensaver-topline">
              <span><i /> {branding.name} · {branding.location}</span>
              <div className="tablet-screensaver-clock" aria-label={`Brisbane time ${timeFormatter.format(now)}`}>
                <strong suppressHydrationWarning>{timeFormatter.format(now)}</strong>
                <time suppressHydrationWarning>{lockscreenDateFormatter.format(now)}</time>
              </div>
              <button type="button" onClick={() => setIsScreensaverVisible(false)}>
                Return to {activeView === "pipeline" ? "tasks" : activeView} <ArrowUpRight size={14} />
              </button>
            </div>

            <div className={`tablet-screensaver-hero ${screensaverLogo.surface === "light" ? "has-light-backed-logo" : ""}`}>
              <Image src={screensaverLogo.src} alt={screensaverLogo.alt} width={screensaverLogo.width} height={screensaverLogo.height} priority sizes="(max-width: 800px) 72vw, 680px" />
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
