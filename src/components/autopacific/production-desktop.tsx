"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ProductionWordmark } from "./production-wordmark";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  FolderKanban,
  Check,
  ChevronRight,
  LayoutGrid,
  List,
  ListTodo,
  Monitor,
  MoreHorizontal,
  Moon,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  X,
  Users,
  UserRound,
  ChevronDown,
} from "lucide-react";
import type { getTabletKioskData } from "@/lib/data/admin";
import type {
  CalendarFlightEvent,
  CalendarItem,
  PipelineTask,
  TabletJobRecord,
} from "@/lib/types";
import { parseTabletView, type TabletView } from "@/lib/tablet-view";
import {
  workspaceInitialView,
  workspaceViews,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import { formatDate } from "@/lib/format";
import { TabletJobPipeline } from "@/components/tablet/tablet-job-pipeline";
import { PipelineBoard } from "@/components/admin/pipeline-board";
import {
  TabletRecordCreateEditor,
  TabletRecordEditEditor,
  TabletTaskDetailSheet,
  TabletScheduleEditor,
  RecordNotesPanel,
  JobBriefReadout,
  type TabletCreateKind,
} from "@/components/tablet/tablet-workspace-editors";
import { JobFiles } from "@/components/autopacific/job-supporting-data";
import { CreateDeliverableTasksButton } from "@/components/autopacific/create-deliverable-tasks-button";
import { getJobDeliverables } from "@/lib/job-deliverable-model";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";
import { DelayHistoryBanner } from "@/components/admin/delay-history-banner";
import { AutopacificSignOutButton } from "@/components/autopacific/autopacific-session-controls";
import { TabletNotificationControl } from "@/components/tablet/tablet-notification-control";
import { NotionAutoSync } from "@/components/admin/notion-auto-sync";
import { ProductionCalendar } from "./production-calendar";
import { useWorkspaceTabTitle } from "./use-workspace-tab-title";
import { ProductionTaskList } from "./production-task-list";
import { useProductionFieldMode } from "./use-production-field-mode";
import { mergeProductionRecords, tasksForProductionView, type ProductionRecordView } from "@/lib/production-task-views";
import { scopeCalendarForWorkspace } from "@/lib/marketing-calendar-scope";
import { readAutopacificOfflineQueue, readAutopacificOfflineSnapshot, writeAutopacificOfflineSnapshot } from "@/lib/autopacific-offline";
import { bulkUpdateJobStatus, movePipelineTask } from "@/app/admin/actions";
import "./production-desktop.css";
import "./production-mobile.css";
import "./production-team.css";
import { useProductionTeam, TeamAvatars } from "./team-context";
import { scopeProductionSpace, type ProductionSpace } from "@/lib/production-team";
import { TeamManagement, TeamNotifications } from "./team-workspace";

const CalendarEventEditor = dynamic(() =>
  import("@/components/admin/calendar-event-editor").then(
    (module) => module.CalendarEventEditor,
  ),
);
const CampaignWorkspace = dynamic(() => import("./campaign-workspace").then(module => module.CampaignWorkspace));
const FlightEventEditor = dynamic(() =>
  import("@/components/tablet/flight-event-editor").then(
    (module) => module.FlightEventEditor,
  ),
);
type Data = Awaited<ReturnType<typeof getTabletKioskData>>;
type OpenRecord =
  | { kind: "job"; record: TabletJobRecord }
  | { kind: "task"; record: PipelineTask };
const emptyAliases = { ready_to_post: "final_draft_notes" };

function JobBriefPanel({
  job,
  marketing,
  onClose,
  onEdit,
  onSchedule,
  scheduling,
}: {
  job: TabletJobRecord;
  marketing: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSchedule: () => void;
  scheduling: boolean;
}) {
  const [tab, setTab] = useState("brief");
  const deliverables = getJobDeliverables(job);
  return (
    <WorkspaceDialog
      className="tablet-job-detail-sheet desktop-brief-panel"
      titleId="desktop-brief-title"
      onClose={onClose}
      header={
        <>
          <div>
            <span>Production brief · {job.status?.label}</span>
            <h2 id="desktop-brief-title">{job.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close brief">
            <X size={18} />
          </button>
        </>
      }
      footer={
        <>
          <small>
            {job.total_tasks - job.open_tasks} / {job.total_tasks} tasks
            completed
          </small>
          {job.status?.key === "planning" ? <button type="button" className="admin-primary-button" disabled={scheduling} onClick={onSchedule}>Move to Scheduled <ChevronRight size={15} /></button> : null}
          <button
            type="button"
            className="admin-primary-button"
            onClick={onEdit}
          >
            Edit full brief <ChevronRight size={15} />
          </button>
        </>
      }
    >
      <DelayHistoryBanner delayInfo={job.delay_info} />
      <dl className="desktop-brief-facts">
        <div>
          <dt>Shoot</dt>
          <dd>
            {formatDate(job.shoot_date)}
            {job.shoot_time ? ` · ${job.shoot_time.slice(0, 5)}` : ""}
          </dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{formatDate(job.due_date)}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{job.location || "Not set"}</dd>
        </div>
      </dl>
      <div
        className="desktop-brief-tabs"
        role="tablist"
        aria-label="Brief sections"
      >
        {["brief", "deliverables", "discussion"].map((key) => (
          <button
            key={key}
            id={`brief-tab-${key}`}
            aria-controls="desktop-brief-content"
            role="tab"
            aria-selected={tab === key}
            type="button"
            onClick={() => setTab(key)}
          >
            {key[0].toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="desktop-brief-content"
        aria-labelledby={`brief-tab-${tab}`}
      >
        {tab === "brief" ? (
          <>
            <section className="desktop-brief-description">
              <h3>Brief</h3>
              <p>
                {job.description || "The team is still developing this brief."}
              </p>
            </section>
            <JobBriefReadout job={job} />
            <JobFiles jobId={job.id} />
            {job.delivery_url ? (
              <a
                className="desktop-delivery-link"
                href={job.delivery_url}
                target="_blank"
                rel="noreferrer"
              >
                Open delivered files <ChevronRight size={14} />
              </a>
            ) : null}
          </>
        ) : tab === "deliverables" ? (
          <>
            <ul className="desktop-deliverables">
              {deliverables.map((item) => (
                <li key={item.id}>
                  <Check size={14} />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.date
                        ? `Due ${formatDate(item.date)}`
                        : job.due_date
                          ? `Job deadline · ${formatDate(job.due_date)}`
                          : "No deadline set"}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
            {!deliverables.length ? (
              <p>No deliverables have been added yet.</p>
            ) : null}
            {!marketing && deliverables.length && !job.status?.is_closed ? (
              <CreateDeliverableTasksButton
                jobId={job.id}
                deliverables={deliverables}
              />
            ) : null}
          </>
        ) : (
          <RecordNotesPanel
            notes={job.record_notes}
            legacyNote={job.notes}
            recordId={job.id}
            recordKind="job"
          />
        )}
      </div>
    </WorkspaceDialog>
  );
}

export function FlightReadOnly({
  flight,
  onClose,
}: {
  flight: CalendarFlightEvent;
  onClose: () => void;
}) {
  return (
    <WorkspaceDialog
      className="tablet-job-detail-sheet"
      titleId="read-flight-title"
      onClose={onClose}
      header={
        <>
          <div>
            <span>Flight plan</span>
            <h2 id="read-flight-title">{flight.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close flight details"
          >
            <X size={18} />
          </button>
        </>
      }
    >
      <dl className="desktop-brief-facts">
        <div>
          <dt>From</dt>
          <dd>
            {flight.origin_location} · {flight.departure_airline}
          </dd>
        </div>
        <div>
          <dt>Departure</dt>
          <dd>
            {formatDate(flight.departure_date)} ·{" "}
            {flight.departure_time.slice(0, 5)}
          </dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>
            {flight.destination_location} · {flight.arrival_airline}
          </dd>
        </div>
        <div>
          <dt>Arrival</dt>
          <dd>
            {formatDate(flight.arrival_date)} ·{" "}
            {flight.arrival_time.slice(0, 5)}
          </dd>
        </div>
      </dl>
    </WorkspaceDialog>
  );
}

export function ProductionDesktop({
  data,
  mode,
  initialView,
  requestedJobId,
  today,
  refreshIntervalMinutes,
  notificationPublicKey,
  notionSyncEnabled = false,
  notionSyncIntervalMinutes = 15,
  experience = "desktop",
}: {
  data: Data;
  mode: WorkspaceMode;
  initialView: string;
  requestedJobId?: string;
  today: string;
  refreshIntervalMinutes: number;
  notificationPublicKey: string;
  notionSyncEnabled?: boolean;
  notionSyncIntervalMinutes?: number;
  experience?: "desktop" | "mobile";
}) {
  const marketing = mode === "marketing",
    router = useRouter();
  const team = useProductionTeam();
  const userId = team?.userId;
  const [space, setSpace] = useState<ProductionSpace>("videographer");
  const [teamSelection, setTeamSelection] = useState<string[] | null>(null);
  const [manageTeam, setManageTeam] = useState(false);
  const reviewOnly = marketing && space === "videographer";
  const [snapshot, setSnapshot] = useState({ source: data, data });
  const field = useProductionFieldMode(team?.userId, team?.userId === team?.videographerId);
  const syncFieldChanges = field.sync;
  const sourceData = useMemo(() => scopeCalendarForWorkspace(snapshot.source === data ? snapshot.data : data, mode), [data, mode, snapshot]);
  const allLive = useMemo(() => {
    if (field.online || !field.queue.length) return sourceData;
    return { ...sourceData,
      pipelineJobs: sourceData.pipelineJobs.map(job => { const move = field.queue.find(item => item.entity === "job" && item.recordId === job.id); return move ? { ...job, status_id: move.statusId, status: sourceData.jobStatuses.find(status => status.id === move.statusId) ?? job.status } : job; }),
      pipelineTasks: sourceData.pipelineTasks.map(task => { const move = field.queue.find(item => item.entity === "task" && item.recordId === task.id); return move ? { ...task, status_id: move.statusId } : task; }),
    };
  }, [field.online, field.queue, sourceData]);
  const live = useMemo(() => team ? scopeProductionSpace(allLive, space === "mine" ? [team.userId] : space === "team" ? teamSelection ?? team.members.map(member => member.user_id) : [team.videographerId], space === "team") : allLive, [allLive, space, team, teamSelection]);
  const [view, setView] = useState<TabletView>(
    workspaceInitialView(initialView === "planning" ? "jobs" : parseTabletView(initialView), mode, true, true),
  );
  const [jobView, setJobView] = useState<"active" | "planning" | "completed">(
    initialView === "planning" ? "planning" : "active",
  );
  const [taskView, setTaskView] = useState<ProductionRecordView>("active");
  useWorkspaceTabTitle(mode, view, view === "pipeline" ? taskView : jobView);
  const [layout, setLayout] = useState("board"),
    [search, setSearch] = useState("");
  const [theme, setTheme] = useState("light"),
    [notice, setNotice] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [startingTask, setStartingTask] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(experience === "mobile");
  const [campaignRefresh, setCampaignRefresh] = useState(0);
  const [viewing, setViewing] = useState<OpenRecord | null>(() => {
    const job = data.pipelineJobs.find((job) => job.id === requestedJobId);
    return job ? { kind: "job", record: job } : null;
  });
  const [editing, setEditing] = useState<OpenRecord | null>(null);
  const [create, setCreate] = useState<{
    kind: "job" | "task";
    date: string;
    source?: TabletJobRecord | PipelineTask;
  } | null>(null);
  const [eventDate, setEventDate] = useState<string | null>(null),
    [event, setEvent] = useState<Data["calendarEvents"][number] | null>(null);
  const [flightDate, setFlightDate] = useState<string | null>(null),
    [flight, setFlight] = useState<CalendarFlightEvent | null>(null),
    [readFlight, setReadFlight] = useState<CalendarFlightEvent | null>(null);
  const [scheduleItem, setScheduleItem] = useState<CalendarItem | null>(null);
  const etags = useRef(new Map<string, string>()),
    inflight = useRef(new Set<string>()),
    newMenu = useRef<HTMLDetailsElement>(null);
  const refreshAgain = useRef(new Set<string>());
  const initialFieldSync = useRef(false);
  useEffect(() => {
    if (!userId) return;
    const stored = localStorage.getItem(`apg-space:${userId}`);
    if (stored !== "mine" && stored !== "team") return;
    const timer = setTimeout(() => { setSpace(stored); if (stored === "team") setView("calendar"); }, 0);
    return () => clearTimeout(timer);
  }, [userId]);
  useEffect(() => {
    document.documentElement.classList.add("apg-desktop-active");
    const saved = localStorage.getItem("apg-desktop-theme");
    const timer = window.setTimeout(() => {
      if (saved === "dark") setTheme("dark");
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.documentElement.classList.remove("apg-desktop-active");
    };
  }, []);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobileLayout(experience === "mobile" || media.matches);
    const timer = window.setTimeout(update, 0);
    media.addEventListener("change", update);
    return () => { window.clearTimeout(timer); media.removeEventListener("change", update); };
  }, [experience]);
  useEffect(() => {
    document.cookie = `${marketing ? "autopacific-marketing-view" : "trushot-tablet-view"}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [marketing, view]);
  useEffect(() => {
    const root = document.documentElement;
    const oldScheme = root.style.colorScheme;
    const oldBackground = root.style.background;
    const meta = document.querySelector('meta[name="theme-color"]');
    const oldColor = meta?.getAttribute("content");
    const statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const oldStatus = statusMeta?.getAttribute("content");
    const background = theme === "dark" ? "#0b171f" : "#f4f6f8";
    root.style.colorScheme = theme;
    root.style.background = background;
    meta?.setAttribute("content", background);
    statusMeta?.setAttribute("content", theme === "dark" ? "black" : "default");
    return () => { root.style.colorScheme = oldScheme; root.style.background = oldBackground; if (oldColor) meta?.setAttribute("content", oldColor); if (oldStatus) statusMeta?.setAttribute("content", oldStatus); };
  }, [theme]);
  useEffect(() => {
    if (!navigator.onLine) {
      const stored = readAutopacificOfflineSnapshot<{ kind: string; data: Data }>(team?.userId);
      const required = ["pipelineJobs", "pipelineTasks", "jobStatuses", "statuses", "clientOptions", "jobOptions", "calendarJobs", "calendarTasks", "calendarEvents", "flightEvents"] as const;
      if (stored?.snapshot?.kind === "production-workspace-v2" && required.every(key => Array.isArray(stored.snapshot.data?.[key]))) {
        const timer = window.setTimeout(() => setSnapshot({ source: data, data: stored.snapshot.data }), 0);
        return () => window.clearTimeout(timer);
      }
    }
  }, [data, team?.userId]);
  useEffect(() => { if (field.online && navigator.onLine) writeAutopacificOfflineSnapshot({ kind: "production-workspace-v2", data: sourceData }, team?.userId); }, [field.online, sourceData, team?.userId]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (newMenu.current && !newMenu.current.contains(event.target as Node))
        newMenu.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && newMenu.current?.open) { newMenu.current.open = false; newMenu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  const refresh = useCallback(
    async function refreshTab(target: TabletView) {
      if (target === "campaigns") { setCampaignRefresh(value => value + 1); return; }
      const key =
        target === "jobs"
          ? "jobs"
          : target === "pipeline"
            ? "tasks"
            : "schedule";
      if (inflight.current.has(key)) { refreshAgain.current.add(key); return; }
      if (!navigator.onLine) {
        setNotice(
          "Offline · your last loaded records remain visible. Reconnect before saving changes.",
        );
        return;
      }
      inflight.current.add(key);
      setRefreshing(true);
      try {
        if (!await syncFieldChanges()) return;
        const headers = new Headers();
        if (etags.current.has(key))
          headers.set("If-None-Match", etags.current.get(key)!);
        const response = await fetch(`/api/autopacific/tab?view=${key}&mode=${mode}`, {
          cache: "no-store",
          headers,
          credentials: "same-origin",
        });
        if (response.status !== 304) {
          if (response.status === 401) {
            const destination = marketing ? "/marketing" : experience === "mobile" ? "/autopacific/mobile" : "/autopacific";
            // Discard stale authenticated clients rather than leave a cached workspace in history.
            window.location.replace(`/${marketing ? "marketing" : "autopacific"}/login?next=${encodeURIComponent(destination)}`);
            return;
          }
          if (!response.ok)
            throw new Error(
              "Workspace refresh failed. Your displayed records are unchanged.",
            );
          const payload = await response.json();
          setSnapshot((current) => ({
            source: data,
            data: {
              ...(current.source === data ? current.data : data),
              ...payload,
            },
          }));
          const tag = response.headers.get("etag");
          if (tag) etags.current.set(key, tag);
        }
        setNotice("");
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : "Refresh failed.");
      } finally {
        inflight.current.delete(key);
        setRefreshing(inflight.current.size > 0);
        if (refreshAgain.current.delete(key) && navigator.onLine) void refreshTab(target);
      }
    },
    [data, experience, syncFieldChanges, marketing, mode],
  );
  useEffect(() => {
    if (initialFieldSync.current) return;
    initialFieldSync.current = true;
    // Resume an interrupted field sync without waiting for the refresh timer.
    if (navigator.onLine && readAutopacificOfflineQueue(team?.userId).length) void syncFieldChanges().then(ok => { if (ok) void refresh(view); });
  }, [refresh, syncFieldChanges, view, team?.userId]);
  const editorOpen = Boolean(
    editing || create || eventDate || flightDate || scheduleItem || viewing || controlsOpen || manageTeam,
  );
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible" && !editorOpen)
        void refresh(view);
    };
    const timer = setInterval(update, refreshIntervalMinutes * 60_000);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [editorOpen, refresh, refreshIntervalMinutes, view]);
  function select(next: TabletView) {
    if (space === "team" && next !== "calendar") chooseSpace("mine");
    setView(next);
    setSearch("");
    setViewing(null);
    setControlsOpen(false);
    if (newMenu.current) newMenu.current.open = false;
    void refresh(next);
  }
  function chooseSpace(next: ProductionSpace) { setSpace(next); if (team) localStorage.setItem(`apg-space:${team.userId}`, next); }
  function toggleTheme() {
    setTheme(current => { const next = current === "light" ? "dark" : "light"; localStorage.setItem("apg-desktop-theme", next); return next; });
  }
  async function startPlanningTask(task: PipelineTask) {
    const status = live.statuses.find(item => item.key === "in_progress");
    if (reviewOnly || !status || startingTask) return;
    setStartingTask(task.id);
    try {
      if (!navigator.onLine) field.queueMove("task", { recordId: task.id, statusId: status.id, expectedUpdatedAt: task.updated_at, title: task.title });
      else { await movePipelineTask(task.id, status.id); await refresh("pipeline"); }
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The task could not be started. Please retry."); }
    finally { setStartingTask(null); }
  }
  function saved() {
    setEditing(null);
    setCreate(null);
    setEventDate(null);
    setEvent(null);
    setFlightDate(null);
    setFlight(null);
    setScheduleItem(null);
    void refresh(view);
    router.refresh();
  }
  async function schedulePlanningJob(job: TabletJobRecord) {
    const scheduled = live.jobStatuses.find(status => status.key === "scheduled");
    if (!scheduled || scheduling) return;
    if (!job.shoot_date) {
      setViewing(null);
      setEditing({ kind: "job", record: { ...job, status_id: scheduled.id, status: scheduled } });
      return;
    }
    setScheduling(true);
    try {
      await bulkUpdateJobStatus([job.id], scheduled.id);
      setViewing(null);
      await refresh("jobs");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "This job could not be scheduled. Please retry.");
    } finally { setScheduling(false); }
  }
  function start(kind: TabletCreateKind, date?: string) {
    if (reviewOnly && (kind === "task" || kind === "flight")) return;
    if (newMenu.current) newMenu.current.open = false;
    if (kind === "event") {
      setEvent(null);
      setEventDate(date ?? today);
    } else if (kind === "flight") {
      setFlight(null);
      setFlightDate(date ?? today);
    } else setCreate({ kind, date: date ?? (kind === "job" ? "" : today) });
  }
  function openItem(item: CalendarItem) {
    if (item.entity_type === "job") {
      const job = live.pipelineJobs.find((job) => job.id === item.id);
      if (job) setViewing({ kind: "job", record: job });
      else if (!marketing) setScheduleItem(item);
    } else if (item.entity_type === "task") {
      const task = live.pipelineTasks.find((task) => task.id === item.id);
      if (task) setViewing({ kind: "task", record: task });
    } else if (!marketing) setScheduleItem(item);
  }
  const jobs = useMemo(
    () =>
      live.pipelineJobs.filter((job) => {
        const status = live.jobStatuses.find(
          (status) => status.id === job.status_id,
        );
        return (
          (jobView === "planning"
            ? status?.key === "planning"
            : jobView === "completed"
              ? status?.key === "delivered"
              : !status?.is_closed && status?.key !== "planning") &&
          job.title.toLowerCase().includes(search.toLowerCase())
        );
      }),
    [jobView, live.jobStatuses, live.pipelineJobs, search],
  );
  const tasks = useMemo(
    () =>
      tasksForProductionView(live.pipelineTasks, live.statuses, taskView, search),
    [live.pipelineTasks, live.statuses, taskView, search],
  );
  const label =
    space === "team" ? "Team calendar" : view === "pipeline"
      ? "Tasks"
      : view === "calendar"
        ? "Calendar"
        : view === "campaigns"
          ? "Campaigns"
        : view === "today"
          ? "Today"
          : "Jobs";
  const openedJob =
    viewing?.kind === "job"
      ? (allLive.pipelineJobs.find((job) => job.id === viewing.record.id) ??
        viewing.record)
      : null;
  return (
    <main className={`apg-desktop theme-autopacific is-${theme} ${experience === "mobile" ? "is-mobile-app" : ""}`}>
      <NotionAutoSync
        enabled={notionSyncEnabled}
        intervalMinutes={notionSyncIntervalMinutes}
      />
      <aside className="apg-desktop-sidebar">
        <ProductionWordmark className="apg-desktop-wordmark" preload sizes="168px" />
        <small>{marketing ? "MARKETING" : "PRODUCTION"}</small>
        <div className="apg-workspace-groups">
          {(["videographer", "mine"] as const).map(group => <details key={group} open={space === group} className="apg-workspace-group">
            <summary>{group === "mine" ? <UserRound size={15} /> : <BriefcaseBusiness size={15} />} {group === "mine" ? "My Space" : "Videographer"}<ChevronDown size={14} /></summary>
            <nav aria-label={`${group === "mine" ? "My Space" : "Videographer"} pages`}>{workspaceViews(mode, true, true).map(key => <button type="button" key={key} aria-current={space === group && view === key ? "page" : undefined} onClick={() => { select(key); chooseSpace(group); }}>
              {key === "jobs" ? <BriefcaseBusiness size={17} /> : key === "pipeline" ? <ListTodo size={17} /> : key === "campaigns" ? <FolderKanban size={17} /> : key === "calendar" ? <CalendarDays size={17} /> : <Sun size={17} />}<span>{key === "pipeline" ? "Tasks" : key[0].toUpperCase() + key.slice(1)}</span>
            </button>)}</nav>
          </details>)}
          <button type="button" className="apg-team-nav" aria-current={space === "team" ? "page" : undefined} onClick={() => { select("calendar"); chooseSpace("team"); }}><Users size={18} /> Team calendar</button>
          {!marketing && team?.canManage ? <button type="button" className="apg-team-nav" onClick={() => setManageTeam(true)}><Users size={18} /> Manage team</button> : null}
        </div>
        <nav aria-label="Workspace pages" className="apg-mobile-bottom-nav">
          {workspaceViews(mode, true, true).map((key) => (
            <button
              type="button"
              key={key}
              aria-current={view === key ? "page" : undefined}
              onClick={() => select(key)}
            >
              {key === "jobs" ? (
                <BriefcaseBusiness size={18} />
              ) : key === "pipeline" ? (
                <ListTodo size={18} />
              ) : key === "campaigns" ? (
                <FolderKanban size={18} />
              ) : key === "calendar" ? (
                <CalendarDays size={18} />
              ) : (
                <Sun size={18} />
              )}
              <span>
                {key === "pipeline"
                  ? "Tasks"
                  : key[0].toUpperCase() + key.slice(1)}
              </span>
            </button>
          ))}
        </nav>
        <div className="apg-sidebar-bottom">
          <Link href={`/autopacific/security?next=${marketing ? "/marketing" : "/autopacific"}`}><ShieldCheck size={16} /> Account security</Link>
          {!marketing ? (
            <Link href="/autopacific?display=kiosk">
              <Monitor size={16} /> Kiosk display
            </Link>
          ) : null}
          <AutopacificSignOutButton
            destination={marketing ? "/marketing" : "/autopacific"}
            showLabel
          />
        </div>
      </aside>
      <div className="apg-desktop-content">
        <header className="apg-desktop-toolbar">
          <div>
            <ProductionWordmark className="apg-mobile-wordmark" sizes="140px" />
            <span>
              AutoPacific Group / {space === "mine" ? "My Space" : space === "team" ? "Team" : "Videographer"}
            </span>
            <h1>{label}</h1>
          </div>
          <div className="apg-desktop-controls">
            {team ? <TeamNotifications publicKey={notificationPublicKey} onOpenRecord={(kind, id) => { void refresh(kind === "job" ? "jobs" : "pipeline"); const record = kind === "job" ? allLive.pipelineJobs.find(item => item.id === id) : allLive.pipelineTasks.find(item => item.id === id); if (record) { if (kind === "job") setViewing({ kind, record: record as TabletJobRecord }); else setViewing({ kind, record: record as PipelineTask }); } }} /> : null}
            <button
              type="button"
              disabled={refreshing}
              className="apg-toolbar-refresh"
              aria-label="Refresh current page"
              onClick={() => void refresh(view)}
            >
              <span className="apg-toolbar-icon"><RefreshCw size={16} className={refreshing ? "spin" : ""} /></span>
            </button>
            <button
              className="apg-toolbar-theme"
              type="button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              onClick={toggleTheme}
            >
              <span className="apg-toolbar-icon">{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</span>
            </button>
            <details className="apg-new-menu" ref={newMenu}>
              <summary aria-label="Create a new item">
                <span className="apg-create-icon"><Plus size={16} /></span><span className="apg-create-label">Create</span>
              </summary>
              <div>
                <button type="button" onClick={() => start("job")}>
                  Job brief
                </button>
                {space !== "team" ? <button type="button" onClick={() => start("event")}>
                  Calendar event
                </button> : null}
                {!reviewOnly ? (
                  <>
                    <button type="button" onClick={() => start("task")}>
                      Task / asset
                    </button>
                    {space !== "team" ? <button type="button" onClick={() => start("flight")}>
                      Flight plan
                    </button> : null}
                  </>
                ) : null}
              </div>
            </details>
            <button type="button" className="apg-mobile-more" onClick={() => setControlsOpen(true)} aria-label="Open workspace settings"><MoreHorizontal size={20} /></button>
          </div>
        </header>
        <div className="apg-mobile-space-picker"><label>Workspace<select aria-label="Choose workspace" value={space} onChange={event => { const next = event.target.value as ProductionSpace; chooseSpace(next); if (next === "team") select("calendar"); }}><option value="videographer">Videographer</option><option value="mine">My Space</option><option value="team">Team calendar</option></select></label></div>
        {space === "team" && team ? <div className="team-calendar-people"><strong><Users size={16} /> Team</strong><button type="button" className="team-text-button" onClick={() => setTeamSelection(null)}>Show everyone</button>{team.members.map(member => <label key={member.user_id}><input type="checkbox" checked={(teamSelection ?? team.members.map(item => item.user_id)).includes(member.user_id)} onChange={event => setTeamSelection(current => { const ids = current ?? team.members.map(item => item.user_id); return event.target.checked ? [...ids, member.user_id] : ids.filter(id => id !== member.user_id); })} /><i style={{ background: member.avatar_color }} />{member.display_name}</label>)}</div> : null}
        {notice ? (
          <p className="apg-notice" role="status">
            {notice}
          </p>
        ) : null}
        {!field.online || field.queue.length || field.message ? <p className="apg-field-status" role="status"><span>{field.online ? field.queue.length ? `${field.queue.length} changes waiting to sync` : "Field changes synced" : "Offline field mode"}</span>{field.message || "Your last loaded workspace is available. Status changes will sync when reception returns."}</p> : null}
        {view === "jobs" || view === "pipeline" ? (
          <div className="apg-desktop-filterbar">
            {view === "jobs" ? (
              <div className="apg-view-pills" aria-label="Job views">
                {(["active", "planning", "completed"] as const).map((key) => (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={jobView === key}
                    onClick={() => setJobView(key)}
                  >
                    {key === "active"
                      ? "Active jobs"
                      : key[0].toUpperCase() + key.slice(1)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="apg-view-pills" aria-label="Task views">
                {(["active", "planning", "completed"] as const).map(key => <button type="button" key={key} aria-pressed={taskView === key} onClick={() => { setTaskView(key); void refresh("pipeline"); }}>{key === "active" ? "Active jobs" : key[0].toUpperCase() + key.slice(1)}</button>)}
              </div>
            )}
            <label className="apg-search">
              <Search size={15} />
              <input
                aria-label={`Search ${label.toLowerCase()}`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
              />
            </label>
            {view === "jobs" ? (
              <div className="apg-layout-switch">
                <button
                  type="button"
                  aria-label="Board view"
                  aria-pressed={layout === "board"}
                  onClick={() => setLayout("board")}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  aria-pressed={layout === "list"}
                  onClick={() => setLayout("list")}
                >
                  <List size={16} />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <section
          key={view}
          className={`apg-desktop-main ${view === "jobs" && jobView === "planning" ? "is-planning" : ""}`}
          aria-label={`${label} workspace`}
        >
          {view === "campaigns" ? <CampaignWorkspace statuses={live.jobStatuses} marketing={marketing} refreshKey={campaignRefresh} assigneeIds={space === "mine" && team ? [team.userId] : team ? [team.videographerId] : undefined} /> : view === "jobs" ? (
            layout === "list" || jobView === "completed" ? (
              <div className="apg-job-list">
                {jobs.length ? (
                  jobs.map((job) => (
                    <button
                      type="button"
                      key={job.id}
                      onClick={() => setViewing({ kind: "job", record: job })}
                    >
                      <div>
                        <strong>{job.title}</strong>
                        <TeamAvatars ids={job.assignee_ids} />
                        <small>
                          {job.description?.slice(0, 110) ||
                            "Brief in progress"}
                        </small>
                      </div>
                      <span
                        className={`apg-stage-label ${job.status?.is_closed ? "is-complete" : job.due_date && job.due_date < today ? "is-overdue" : ""}`}
                      >
                        {job.status?.label}
                      </span>
                      <span>
                        Shoot {formatDate(job.shoot_date)}
                        <small>Due {formatDate(job.due_date)}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))
                ) : (
                  <p className="apg-empty">No jobs in this view.</p>
                )}
              </div>
            ) : (
              <TabletJobPipeline
                key={JSON.stringify(
                  jobs.map((job) => [job.id, job.updated_at, job.status_id, job.open_tasks, job.total_tasks]),
                )}
                initialJobs={jobs}
                statuses={live.jobStatuses}
                visibleStatusKeys={live.jobStatuses
                  .filter((status) =>
                    jobView === "planning"
                      ? status.key === "planning"
                      : !status.is_closed && status.key !== "planning",
                  )
                  .map((status) => status.key)}
                enableCompletion={jobView === "active"}
                editable
                isOffline={!field.online}
                onQueueMove={mutation => field.queueMove("job", mutation)}
                onJobsChange={changed => { if (!field.online) setSnapshot(current => ({ source: data, data: { ...(current.source === data ? current.data : data), pipelineJobs: mergeProductionRecords((current.source === data ? current.data : data).pipelineJobs, changed) } })); }}
                onViewJob={(job) => setViewing({ kind: "job", record: job })}
                onEditJob={(job) => setEditing({ kind: "job", record: job })}
                onDuplicateJob={(job) =>
                  setCreate({
                    kind: "job",
                    date: job.shoot_date ?? "",
                    source: job,
                  })
                }
                onMoveSaved={() => void refresh("jobs")}
              />
            )
          ) : view === "pipeline" && taskView !== "active" ? (
            <ProductionTaskList tasks={tasks} statuses={live.statuses} completed={taskView === "completed"} onOpen={task => setViewing({ kind: "task", record: task })} onStart={!reviewOnly && taskView === "planning" ? task => void startPlanningTask(task) : undefined} startingId={startingTask} onDuplicate={!reviewOnly ? task => setCreate({ kind: "task", date: today, source: task }) : undefined} />
          ) : view === "pipeline" ? (
            <PipelineBoard
              key={JSON.stringify(
                tasks.map((task) => [task.id, task.updated_at, task.status_id]),
              )}
              initialTasks={tasks}
              initialStatuses={
                reviewOnly
                  ? live.statuses.map((status) =>
                      status.key === "final_draft_notes"
                        ? { ...status, label: "Review" }
                        : status,
                    )
                  : live.statuses
              }
              editable={!reviewOnly}
              isOffline={!field.online}
              onQueueMove={mutation => field.queueMove("task", mutation)}
              onTasksChange={changed => { if (!field.online) setSnapshot(current => ({ source: data, data: { ...(current.source === data ? current.data : data), pipelineTasks: mergeProductionRecords((current.source === data ? current.data : data).pipelineTasks, changed) } })); }}
              workflowEnabled={!reviewOnly}
              approvalOnly={reviewOnly}
              completionStatusKey="final_draft_notes"
              visibleStatusKeys={
                reviewOnly
                  ? ["in_progress", "final_draft_notes"]
                  : [
                      "in_progress",
                      "ready_for_revision",
                      "final_draft_notes",
                    ]
              }
              statusAliases={
                reviewOnly
                  ? { ...emptyAliases, ready_for_revision: "final_draft_notes" }
                  : emptyAliases
              }
              variant="tablet"
              onViewTask={(task) => setViewing({ kind: "task", record: task })}
              onEditTask={
                !reviewOnly
                  ? (task) => setEditing({ kind: "task", record: task })
                  : undefined
              }
              onDuplicateTask={
                !reviewOnly
                  ? (task) =>
                      setCreate({ kind: "task", date: today, source: task })
                  : undefined
              }
              onMoveSaved={() => void refresh("pipeline")}
            />
          ) : (
            <ProductionCalendar
              key={view}
              data={live}
              today={today}
              todayOnly={view === "today"}
              mobile={isMobileLayout}
              marketing={marketing}
              personalTools={space === "mine"}
              readOnly={space === "team"}
              onOpenItem={openItem}
              onOpenEvent={(item) => {
                setEvent(item);
                setEventDate(item.start_date);
              }}
              onOpenFlight={(item) => {
                if (reviewOnly || (team?.role === "marketing" && !item.assignee_ids?.includes(team.userId))) setReadFlight(item);
                else {
                  setFlight(item);
                  setFlightDate(item.departure_date);
                }
              }}
              onCreate={start}
            />
          )}
        </section>
      </div>
      {controlsOpen ? <WorkspaceDialog className="apg-settings-sheet" titleId="apg-settings-title" onClose={() => setControlsOpen(false)} header={<><div><span>AutoPacific {marketing ? "Marketing" : "Production"}</span><h2 id="apg-settings-title">Workspace settings</h2></div><button type="button" onClick={() => setControlsOpen(false)} aria-label="Close workspace settings"><X size={20} /></button></>} footer={<button type="button" className="admin-primary-button" onClick={() => setControlsOpen(false)}>Done</button>}>
        <div className="apg-settings-actions">
          {!marketing && team?.canManage ? <button type="button" onClick={() => { setControlsOpen(false); setManageTeam(true); }}><Users size={20} /><span>Manage team<small>People, usernames and permissions</small></span></button> : null}
          <button type="button" onClick={toggleTheme}>{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}<span>Appearance<small>Switch to {theme === "light" ? "dark" : "light"} mode</small></span></button>
          {notificationPublicKey ? <div className="apg-settings-notifications"><TabletNotificationControl experience="autopacific" experienceName="AutoPacific" publicKey={notificationPublicKey} /><span>Device notifications<small>Reminders for your assigned work and flights</small></span></div> : null}
          <Link href={`/autopacific/security?next=${marketing ? "/marketing" : "/autopacific/mobile"}`}><ShieldCheck size={20} /><span>Account security<small>Password and authenticator verification</small></span></Link>
          <AutopacificSignOutButton destination={marketing ? "/marketing" : "/autopacific"} showLabel />
        </div>
      </WorkspaceDialog> : null}
      {manageTeam ? <TeamManagement onClose={() => setManageTeam(false)} /> : null}
      {openedJob ? (
        <JobBriefPanel
          key={openedJob.id}
          job={openedJob}
          marketing={reviewOnly}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing({ kind: "job", record: openedJob });
            setViewing(null);
          }}
          onSchedule={() => void schedulePlanningJob(openedJob)}
          scheduling={scheduling}
        />
      ) : viewing?.kind === "task" ? (
        <TabletTaskDetailSheet
          task={allLive.pipelineTasks.find(task=>task.id===viewing.record.id)??viewing.record}
          onClose={() => setViewing(null)}
          onEdit={
            !reviewOnly
              ? () => {
                  setEditing(viewing);
                  setViewing(null);
                }
              : undefined
          }
        />
      ) : null}
      {editing ? (
        <TabletRecordEditEditor
          key={editing.record.id}
          record={editing.record}
          type={editing.kind}
          allowDeliverableTasks={!reviewOnly}
          fixedClientId={live.clientOptions[0]?.id}
          clientOptions={live.clientOptions}
          jobOptions={live.jobOptions}
          jobStatuses={live.jobStatuses}
          taskStatuses={live.statuses}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}
      {create ? (
        <TabletRecordCreateEditor
          kind={create.kind}
          defaultDate={create.date}
          sourceRecord={create.source}
          initialStatusId={
            live.jobStatuses.find(
              (status) =>
                status.key ===
                (jobView === "planning" || !create.date
                  ? "planning"
                  : "scheduled"),
            )?.id
          }
          fixedClientId={live.clientOptions[0]?.id}
          clientOptions={live.clientOptions}
          jobOptions={live.jobOptions}
          jobStatuses={live.jobStatuses}
          taskStatuses={live.statuses}
          onClose={() => setCreate(null)}
          onCreated={saved}
        />
      ) : null}
      {eventDate ? (
        <CalendarEventEditor
          event={event}
          defaultDate={eventDate}
          defaultClientId={live.clientOptions[0]?.id}
          onClose={() => setEventDate(null)}
          onSaved={saved}
          onDeleted={saved}
        />
      ) : null}
      {!reviewOnly && flightDate ? (
        <FlightEventEditor
          event={flight}
          flightEvents={live.flightEvents}
          defaultDate={flightDate}
          defaultClientId={live.clientOptions[0]?.id}
          onClose={() => setFlightDate(null)}
          onSaved={saved}
          onDeleted={saved}
        />
      ) : null}
      {readFlight ? (
        <FlightReadOnly
          flight={readFlight}
          onClose={() => setReadFlight(null)}
        />
      ) : null}
      {!marketing && scheduleItem ? (
        <TabletScheduleEditor
          item={scheduleItem}
          onClose={() => setScheduleItem(null)}
          onSaved={saved}
        />
      ) : null}
    </main>
  );
}
