"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, LayoutDashboard, RefreshCw, Rows3 } from "lucide-react";
import { PipelineBoard } from "@/components/admin/pipeline-board";
import { NotionAutoSync } from "@/components/admin/notion-auto-sync";
import { TabletCalendar } from "@/components/tablet/tablet-calendar";
import type { CalendarJob, CalendarTask, PipelineTask, TaskStatus } from "@/lib/types";

type TabletView = "pipeline" | "calendar";

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

export function TabletPipelineKiosk({
  calendarJobs,
  calendarTasks,
  initialNow,
  initialStatuses,
  initialTasks,
  pendingRequestCount,
  pipelineVersion,
  notionSyncEnabled,
  notionSyncIntervalMinutes,
  refreshIntervalMinutes,
  today,
}: {
  calendarJobs: CalendarJob[];
  calendarTasks: CalendarTask[];
  initialNow: string;
  initialStatuses: TaskStatus[];
  initialTasks: PipelineTask[];
  pendingRequestCount: number;
  pipelineVersion: string;
  notionSyncEnabled: boolean;
  notionSyncIntervalMinutes: number;
  refreshIntervalMinutes: number;
  today: string;
}) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<TabletView>("pipeline");
  const [now, setNow] = useState(() => new Date(initialNow));
  const lastRefreshAt = useRef(new Date(initialNow).getTime());
  const refreshIntervalMs = refreshIntervalMinutes * 60_000;

  const refresh = useCallback(() => {
    lastRefreshAt.current = Date.now();
    router.refresh();
  }, [router]);

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
    <main className="tablet-kiosk">
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
          <button type="button" className={activeView === "pipeline" ? "is-active" : ""} onClick={() => setActiveView("pipeline")} aria-current={activeView === "pipeline" ? "page" : undefined}><Rows3 size={15} /> Pipeline</button>
          <button type="button" className={activeView === "calendar" ? "is-active" : ""} onClick={() => setActiveView("calendar")} aria-current={activeView === "calendar" ? "page" : undefined}><CalendarDays size={15} /> Calendar</button>
        </nav>

        <div className="tablet-kiosk-actions">
          <Link className="tablet-notification-button" href="/admin/requests" aria-label={`${pendingRequestCount} client ${pendingRequestCount === 1 ? "request" : "requests"} awaiting review`} title="Client requests">
            <Bell size={15} />
            {pendingRequestCount ? <span>{pendingRequestCount > 99 ? "99+" : pendingRequestCount}</span> : null}
          </Link>
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
        ) : <TabletCalendar jobs={calendarJobs} tasks={calendarTasks} today={today} />}
      </section>
    </main>
  );
}
