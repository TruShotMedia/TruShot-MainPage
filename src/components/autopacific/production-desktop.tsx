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
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
  X,
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
import { bulkUpdateJobStatus } from "@/app/admin/actions";
import "./production-desktop.css";

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
}) {
  const marketing = mode === "marketing",
    router = useRouter();
  const [snapshot, setSnapshot] = useState({ source: data, data });
  const live = snapshot.source === data ? snapshot.data : data;
  const [view, setView] = useState<TabletView>(
    workspaceInitialView(parseTabletView(initialView), mode, true, true),
  );
  const [jobView, setJobView] = useState<"active" | "planning" | "completed">(
    initialView === "planning" ? "planning" : "active",
  );
  useWorkspaceTabTitle(mode, view, jobView);
  const [layout, setLayout] = useState("board"),
    [search, setSearch] = useState("");
  const [theme, setTheme] = useState("light"),
    [notice, setNotice] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
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
    document.cookie = `${marketing ? "autopacific-marketing-view" : "trushot-tablet-view"}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [marketing, view]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (newMenu.current && !newMenu.current.contains(event.target as Node))
        newMenu.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const refresh = useCallback(
    async (target: TabletView) => {
      if (target === "campaigns") { setCampaignRefresh(value => value + 1); return; }
      const key =
        target === "jobs"
          ? "jobs"
          : target === "pipeline"
            ? "tasks"
            : "schedule";
      if (inflight.current.has(key)) return;
      if (!navigator.onLine) {
        setNotice(
          "Offline · your last loaded records remain visible. Reconnect before saving changes.",
        );
        return;
      }
      inflight.current.add(key);
      setRefreshing(true);
      try {
        const headers = new Headers();
        if (etags.current.has(key))
          headers.set("If-None-Match", etags.current.get(key)!);
        const response = await fetch(`/api/autopacific/tab?view=${key}`, {
          cache: "no-store",
          headers,
          credentials: "same-origin",
        });
        if (response.status !== 304) {
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
      }
    },
    [data],
  );
  const editorOpen = Boolean(
    editing || create || eventDate || flightDate || scheduleItem,
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
    setView(next);
    setSearch("");
    setViewing(null);
    void refresh(next);
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
    if (marketing && (kind === "task" || kind === "flight")) return;
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
      live.pipelineTasks.filter((task) =>
        `${task.title} ${task.job?.title ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [live.pipelineTasks, search],
  );
  const label =
    view === "pipeline"
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
      ? (live.pipelineJobs.find((job) => job.id === viewing.record.id) ??
        viewing.record)
      : null;
  return (
    <main className={`apg-desktop theme-autopacific is-${theme}`}>
      <NotionAutoSync
        enabled={notionSyncEnabled}
        intervalMinutes={notionSyncIntervalMinutes}
      />
      <aside className="apg-desktop-sidebar">
        <ProductionWordmark className="apg-desktop-wordmark" preload sizes="168px" />
        <small>{marketing ? "MARKETING" : "PRODUCTION"}</small>
        <nav aria-label="Workspace pages">
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
            <span>
              AutoPacific Group / {marketing ? "Marketing" : "Production"}
            </span>
            <h1>{label}</h1>
          </div>
          <div className="apg-desktop-controls">
            {!marketing && notificationPublicKey ? (
              <TabletNotificationControl
                experience="autopacific"
                experienceName="AutoPacific"
                publicKey={notificationPublicKey}
              />
            ) : null}
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
              onClick={() =>
                setTheme((current) => {
                  const next = current === "light" ? "dark" : "light";
                  localStorage.setItem("apg-desktop-theme", next);
                  return next;
                })
              }
            >
              <span className="apg-toolbar-icon">{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</span>
            </button>
            <details className="apg-new-menu" ref={newMenu}>
              <summary>
                <span className="apg-create-icon"><Plus size={16} /></span> Create
              </summary>
              <div>
                <button type="button" onClick={() => start("job")}>
                  Job brief
                </button>
                <button type="button" onClick={() => start("event")}>
                  Calendar event
                </button>
                {!marketing ? (
                  <>
                    <button type="button" onClick={() => start("task")}>
                      Task / asset
                    </button>
                    <button type="button" onClick={() => start("flight")}>
                      Flight plan
                    </button>
                  </>
                ) : null}
              </div>
            </details>
          </div>
        </header>
        {notice ? (
          <p className="apg-notice" role="status">
            {notice}
          </p>
        ) : null}
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
              <p>
                {marketing
                  ? "View production progress. Approve reviewed assets to complete them."
                  : "Capture, edit and deliver your assets."}
              </p>
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
          className={`apg-desktop-main ${jobView === "planning" ? "is-planning" : ""}`}
          aria-label={`${label} workspace`}
        >
          {view === "campaigns" ? <CampaignWorkspace statuses={live.jobStatuses} marketing={marketing} refreshKey={campaignRefresh} /> : view === "jobs" ? (
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
          ) : view === "pipeline" ? (
            <PipelineBoard
              key={JSON.stringify(
                tasks.map((task) => [task.id, task.updated_at, task.status_id]),
              )}
              initialTasks={tasks}
              initialStatuses={
                marketing
                  ? live.statuses.map((status) =>
                      status.key === "final_draft_notes"
                        ? { ...status, label: "Review" }
                        : status,
                    )
                  : live.statuses
              }
              editable={!marketing}
              workflowEnabled={!marketing}
              approvalOnly={marketing}
              completionStatusKey="final_draft_notes"
              visibleStatusKeys={
                marketing
                  ? ["not_started", "in_progress", "final_draft_notes"]
                  : [
                      "not_started",
                      "in_progress",
                      "ready_for_revision",
                      "final_draft_notes",
                    ]
              }
              statusAliases={
                marketing
                  ? { ...emptyAliases, ready_for_revision: "final_draft_notes" }
                  : emptyAliases
              }
              variant="tablet"
              onViewTask={(task) => setViewing({ kind: "task", record: task })}
              onEditTask={
                !marketing
                  ? (task) => setEditing({ kind: "task", record: task })
                  : undefined
              }
              onDuplicateTask={
                !marketing
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
              marketing={marketing}
              onOpenItem={openItem}
              onOpenEvent={(item) => {
                setEvent(item);
                setEventDate(item.start_date);
              }}
              onOpenFlight={(item) => {
                if (marketing) setReadFlight(item);
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
      {openedJob ? (
        <JobBriefPanel
          key={openedJob.id}
          job={openedJob}
          marketing={marketing}
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
          task={live.pipelineTasks.find(task=>task.id===viewing.record.id)??viewing.record}
          onClose={() => setViewing(null)}
          onEdit={
            !marketing
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
          allowDeliverableTasks={!marketing}
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
      {!marketing && flightDate ? (
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
