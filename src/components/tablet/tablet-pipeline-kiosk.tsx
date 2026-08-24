"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Expand, LayoutDashboard, RefreshCw, ShieldCheck } from "lucide-react";
import { PipelineBoard } from "@/components/admin/pipeline-board";
import { getTabletWorkload } from "@/lib/tablet-pipeline";
import type { PipelineTask, TaskStatus } from "@/lib/types";

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
  displayName,
  initialNow,
  initialStatuses,
  initialTasks,
  today,
}: {
  displayName: string;
  initialNow: string;
  initialStatuses: TaskStatus[];
  initialTasks: PipelineTask[];
  today: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(initialNow));
  const [lastSynced, setLastSynced] = useState(() => new Date(initialNow));
  const [tasks, setTasks] = useState(initialTasks);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workload = useMemo(() => getTabletWorkload(tasks, initialStatuses, today), [initialStatuses, tasks, today]);

  const handleTasksChange = useCallback((updatedTasks: PipelineTask[]) => {
    setTasks(updatedTasks);
    setLastSynced(new Date());
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 15_000);
    const sync = window.setInterval(() => router.refresh(), 5 * 60_000);
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(sync);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [router]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  }

  return (
    <main className="tablet-kiosk">
      <header className="tablet-kiosk-header">
        <div className="tablet-kiosk-brand">
          <Image src="/brand/logo-green.png" alt="TruShot Media" width={230} height={84} priority />
          <div><strong>Production flow</strong><span>{displayName}&apos;s tablet hub</span></div>
        </div>

        <div className="tablet-kiosk-clock" aria-label={`Brisbane time ${timeFormatter.format(now)}`}>
          <strong suppressHydrationWarning>{timeFormatter.format(now)}</strong>
          <span suppressHydrationWarning>{dateFormatter.format(now)}</span>
        </div>

        <div className="tablet-kiosk-actions">
          <span className="tablet-health-pill"><ShieldCheck size={13} /> Live</span>
          <span className="tablet-stat-pill"><strong>{workload.active}</strong> active</span>
          <span className={workload.overdue ? "tablet-stat-pill is-alert" : "tablet-stat-pill"}><strong>{workload.overdue}</strong> overdue</span>
          <span className="tablet-stat-pill is-upcoming"><strong>{workload.upcoming}</strong> due soon</span>
          <span className="tablet-sync-pill" suppressHydrationWarning>Synced {timeFormatter.format(lastSynced)}</span>
          <button type="button" onClick={() => router.refresh()} aria-label="Refresh tablet pipeline" title="Refresh"><RefreshCw size={15} /></button>
          <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"} title={isFullscreen ? "Exit full screen" : "Full screen"}><Expand size={15} /></button>
          <Link href="/admin/pipeline"><LayoutDashboard size={15} /> CRM</Link>
        </div>
      </header>

      <section className="tablet-kiosk-main" aria-label="Tablet asset pipeline">
        <PipelineBoard initialStatuses={initialStatuses} initialTasks={initialTasks} onTasksChange={handleTasksChange} variant="tablet" />
      </section>
    </main>
  );
}
