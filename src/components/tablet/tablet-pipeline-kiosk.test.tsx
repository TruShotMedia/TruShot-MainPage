// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY, TABLET_ORIENTATION_STORAGE_KEY, TABLET_VIEW_COOKIE_NAME } from "@/lib/tablet-view";
import { TabletPipelineKiosk } from "./tablet-pipeline-kiosk";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
const componentMocks = vi.hoisted(() => ({ calendar: vi.fn(), jobPipeline: vi.fn(), pipeline: vi.fn(), today: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("next/image", () => ({ default: ({ alt, className, src }: { alt: string; className?: string; src: string }) => <span role="img" aria-label={alt} className={className} data-src={src} /> }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/admin/calendar-event-editor", () => ({ CalendarEventEditor: () => <div data-testid="event-editor" /> }));
vi.mock("@/components/tablet/flight-event-editor", () => ({ FlightEventEditor: () => <div data-testid="flight-editor" /> }));
vi.mock("@/components/admin/pipeline-board", () => ({ PipelineBoard: (props: unknown) => { componentMocks.pipeline(props); return <div data-testid="pipeline-view">Pipeline board</div>; } }));
vi.mock("@/components/admin/notion-auto-sync", () => ({ NotionAutoSync: () => null }));
vi.mock("@/components/tablet/tablet-calendar", () => ({ TabletCalendar: (props: unknown) => { componentMocks.calendar(props); return <div data-testid="calendar-view">Calendar board</div>; } }));
vi.mock("@/components/tablet/tablet-job-pipeline", () => ({ TabletJobPipeline: (props: unknown) => { componentMocks.jobPipeline(props); return <div data-testid="job-pipeline-view">Job pipeline</div>; } }));
vi.mock("@/components/tablet/tablet-today", () => ({ TabletToday: (props: unknown) => { componentMocks.today(props); return <div data-testid="today-view">Today itinerary</div>; } }));
vi.mock("@/components/tablet/tablet-workspace-editors", () => ({ TabletJobDetailSheet: ({ job }: { job: { title: string } }) => <div data-testid="job-detail-sheet">{job.title}</div>, TabletRecordCreateEditor: () => <div data-testid="record-editor" />, TabletRecordEditEditor: () => <div data-testid="record-edit-editor" />, TabletScheduleEditor: () => <div data-testid="schedule-editor" /> }));

describe("TabletPipelineKiosk", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    routerMocks.refresh.mockClear();
    componentMocks.calendar.mockClear();
    componentMocks.jobPipeline.mockClear();
    componentMocks.pipeline.mockClear();
    componentMocks.today.mockClear();
    window.localStorage.clear();
    document.cookie = `${TABLET_VIEW_COOKIE_NAME}=; Path=/; Max-Age=0`;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  it("shows the selected page for 60 seconds, the lockscreen for 15 seconds, and supports a persistent pause override", async () => {
    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-08-25T00:00:00.000Z"
        initialStatuses={[
          { id: "open", key: "in_progress", label: "In progress", color: "#3570a9", position: 1, is_open: true },
          { id: "done", key: "posted_done", label: "Posted / Done", color: "#597a62", position: 2, is_open: false },
        ]}
        initialTasks={[
          { id: "task-1", title: "First asset", job_id: "job-1", status_id: "open", asset_type: "Asset", hours: 1, due_date: null, due_time: null, priority: "normal", description: null, position: 1, completed_at: null, updated_at: "2026-08-25T00:00:00.000Z" },
          { id: "task-2", title: "Second asset", job_id: "job-1", status_id: "open", asset_type: "Asset", hours: 1, due_date: null, due_time: null, priority: "normal", description: null, position: 2, completed_at: null, updated_at: "2026-08-25T00:00:00.000Z" },
          { id: "task-3", title: "Complete asset", job_id: "job-2", status_id: "done", asset_type: "Asset", hours: 1, due_date: null, due_time: null, priority: "normal", description: null, position: 3, completed_at: "2026-08-24T00:00:00.000Z", updated_at: "2026-08-25T00:00:00.000Z" },
        ]}
        initialView="pipeline"
        pendingRequestCount={0}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        today="2026-08-25"
      />,
    ));

    await act(async () => vi.advanceTimersByTime(59_999));
    expect(container.querySelector('[data-testid="pipeline-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="kiosk-screensaver"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    const screensaver = container.querySelector('[data-testid="kiosk-screensaver"]');
    expect(screensaver).not.toBeNull();
    expect(screensaver?.querySelector(".tablet-screensaver-clock strong")).not.toBeNull();
    expect(screensaver?.querySelector(".tablet-screensaver-clock time")).not.toBeNull();
    expect(screensaver?.querySelector(".tablet-screensaver-hero strong")).toBeNull();
    expect(screensaver?.querySelector('.tablet-screensaver-hero [role="img"]')).not.toBeNull();
    expect(screensaver?.textContent).toContain("Jobs outstanding1With open assets");
    expect(screensaver?.textContent).toContain("Tasks outstanding2Still in production");
    expect(container.querySelector('[data-testid="calendar-view"]')).toBeNull();

    await act(async () => vi.advanceTimersByTime(14_999));
    expect(container.querySelector('[data-testid="kiosk-screensaver"]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(container.querySelector('[data-testid="kiosk-screensaver"]')).toBeNull();
    expect(container.querySelector('[data-testid="pipeline-view"]')).not.toBeNull();

    const pauseButton = container.querySelector<HTMLButtonElement>('button[aria-label="Pause automatic slideshow"]')!;
    await act(async () => pauseButton.click());
    expect(window.localStorage.getItem(TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY)).toBe("true");
    expect(container.querySelector('button[aria-label="Resume automatic slideshow"]')).not.toBeNull();

    await act(async () => vi.advanceTimersByTime(70_000));
    expect(container.querySelector('[data-testid="pipeline-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="kiosk-screensaver"]')).toBeNull();

    const resumeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Resume automatic slideshow"]')!;
    await act(async () => resumeButton.click());
    expect(window.localStorage.getItem(TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY)).toBe("false");
    await act(async () => vi.advanceTimersByTime(59_999));
    expect(container.querySelector('[data-testid="kiosk-screensaver"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(container.querySelector('[data-testid="kiosk-screensaver"]')).not.toBeNull();
  });

  it("restores the paused rotation override after the kiosk reloads", async () => {
    window.localStorage.setItem(TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY, "true");
    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-08-25T00:00:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
        initialView="pipeline"
        pendingRequestCount={0}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        today="2026-08-25"
      />,
    ));

    await act(async () => vi.advanceTimersByTime(20));
    expect(container.querySelector('button[aria-label="Resume automatic slideshow"]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(container.querySelector('[data-testid="pipeline-view"]')).not.toBeNull();
  });

  it("supports client-specific branding in both the header and lockscreen", async () => {
    await act(async () => root.render(
      <TabletPipelineKiosk
        branding={{
          calendarAccentColor: "#5d91b0",
          calendarCompletedColor: "#3f9b68",
          logoAlt: "Autopacific Group",
          logoHeight: 312,
          logoSrc: "/brand/autopacific-logo-clean.png",
          logoSurface: "light",
          logoWidth: 1800,
          screensaverLogo: {
            alt: "Autopacific Group screensaver",
            height: 312,
            src: "/brand/autopacific-logo-clean.png",
            surface: "light",
            width: 1800,
          },
          name: "Autopacific Group",
          location: "Production",
          theme: "autopacific",
        }}
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-08-25T00:00:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
        initialView="calendar"
        pendingRequestCount={0}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        today="2026-08-25"
      />,
    ));

    const headerLogo = container.querySelector('.tablet-kiosk-brandmark [data-src="/brand/autopacific-logo-clean.png"]');
    expect(headerLogo?.getAttribute("aria-label")).toBe("Autopacific Group");
    expect(container.querySelector(".tablet-kiosk-brandmark")?.classList.contains("is-light-backed")).toBe(true);
    expect(container.querySelector(".tablet-kiosk")?.classList.contains("theme-autopacific")).toBe(true);
    expect(componentMocks.calendar.mock.lastCall?.[0]).toMatchObject({ accentColor: "#5d91b0", completedColor: "#3f9b68", currentTime: "10:00" });

    await act(async () => vi.advanceTimersByTime(60_000));
    const screensaver = container.querySelector('[data-testid="kiosk-screensaver"]');
    expect(screensaver?.getAttribute("aria-label")).toBe("Autopacific Group overview");
    expect(screensaver?.textContent).toContain("Autopacific Group · Production");
    const screensaverLogo = screensaver?.querySelector('.tablet-screensaver-hero [data-src="/brand/autopacific-logo-clean.png"]');
    expect(screensaverLogo?.getAttribute("aria-label")).toBe("Autopacific Group screensaver");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("switches views and keeps all editing locked until the pencil is enabled", async () => {
    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-08-25T00:00:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
        initialView="pipeline"
        pendingRequestCount={3}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        today="2026-08-25"
      />,
    ));

    expect(container.querySelector('[data-testid="pipeline-view"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/requests"]')).toBeNull();
    expect(componentMocks.pipeline.mock.lastCall?.[0]).toMatchObject({ editable: false, workflowEnabled: true });
    expect(container.querySelector(".tablet-create-dock")).toBeNull();
    expect(container.textContent).not.toContain("Full screen");
    expect(container.textContent).not.toContain("due soon");
    expect(container.textContent).toContain("Jobs");
    expect(container.textContent).toContain("Tasks");

    const jobsTab = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Jobs"))!;
    await act(async () => jobsTab.click());
    expect(container.querySelector('[data-testid="job-pipeline-view"]')).not.toBeNull();
    expect(componentMocks.jobPipeline.mock.lastCall?.[0]).toMatchObject({ editable: false });
    expect(document.cookie).toContain(`${TABLET_VIEW_COOKIE_NAME}=jobs`);

    const tasksTab = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Tasks"))!;
    await act(async () => tasksTab.click());
    expect(container.querySelector('[data-testid="pipeline-view"]')).not.toBeNull();
    expect(componentMocks.pipeline.mock.lastCall?.[0]).toMatchObject({ editable: false, workflowEnabled: true });

    const editButton = container.querySelector<HTMLButtonElement>('button[aria-label="Turn on tablet editing"]')!;
    await act(async () => editButton.click());
    expect(componentMocks.pipeline.mock.lastCall?.[0]).toMatchObject({ editable: true });
    expect(container.querySelector(".tablet-create-dock")).not.toBeNull();
    expect(container.textContent).toContain("Flight");
    expect(container.querySelector('button[aria-label="Turn off tablet editing"]')).not.toBeNull();
    expect(container.textContent).toContain("Jobs");
    expect(container.textContent).toContain("Tasks");

    await act(async () => jobsTab.click());
    expect(container.querySelector('[data-testid="job-pipeline-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pipeline-view"]')).toBeNull();
    expect(componentMocks.jobPipeline.mock.lastCall?.[0]).toMatchObject({ editable: true });

    await act(async () => tasksTab.click());
    expect(container.querySelector('[data-testid="pipeline-view"]')).not.toBeNull();

    const calendarTab = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Calendar"))!;
    await act(async () => calendarTab.click());
    expect(container.querySelector('[data-testid="calendar-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pipeline-view"]')).toBeNull();
    expect(componentMocks.calendar.mock.lastCall?.[0]).toMatchObject({ editable: true });
    expect(document.cookie).toContain(`${TABLET_VIEW_COOKIE_NAME}=calendar`);

    const disableButton = container.querySelector<HTMLButtonElement>('button[aria-label="Turn off tablet editing"]')!;
    await act(async () => disableButton.click());
    expect(componentMocks.calendar.mock.lastCall?.[0]).toMatchObject({ editable: false });
    expect(container.querySelector(".tablet-create-dock")).toBeNull();
  });

  it("adds the Today view after Calendar only when it is enabled", async () => {
    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-10-16T00:00:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
        initialView="calendar"
        pendingRequestCount={0}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        showTodayView
        today="2026-10-16"
      />,
    ));

    const tabs = [...container.querySelectorAll<HTMLButtonElement>(".tablet-kiosk-tabs-mobile button")];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Jobs", "Tasks", "Calendar", "Today"]);
    await act(async () => tabs[3].click());
    expect(container.querySelector('[data-testid="today-view"]')).not.toBeNull();
    expect(componentMocks.today.mock.lastCall?.[0]).toMatchObject({ editable: false, today: "2026-10-16" });
    expect(document.cookie).toContain(`${TABLET_VIEW_COOKIE_NAME}=today`);
  });

  it("refreshes conservatively only while the kiosk is visible and online", async () => {
    const previousFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: "schedule",
      calendarCampaignAssets: [],
      calendarEvents: [],
      calendarJobs: [],
      calendarTasks: [],
      flightEvents: [],
    }), { headers: { ETag: '"schedule-v1"' } }));
    globalThis.fetch = fetchMock;
    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-08-25T00:00:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
        initialView="calendar"
        pendingRequestCount={0}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        today="2026-08-25"
      />,
    ));

    await act(async () => vi.advanceTimersByTime(15 * 60_000));
    expect(fetchMock).toHaveBeenCalledWith("/api/autopacific/tab?view=schedule", expect.objectContaining({ cache: "no-store" }));
    expect(routerMocks.refresh).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="pipeline-view"], [data-testid="calendar-view"]')).not.toBeNull();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => vi.advanceTimersByTime(15 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    globalThis.fetch = previousFetch;
  });

  it("rotates immediately with measured dimensions when an old kiosk browser cannot lock orientation", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1280 });
    Object.defineProperty(window.screen, "orientation", {
      configurable: true,
      value: { lock: vi.fn(() => new Promise<void>(() => undefined)) },
    });

    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-08-25T00:00:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
        initialView="pipeline"
        pendingRequestCount={0}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        today="2026-08-25"
      />,
    ));
    await act(async () => vi.advanceTimersByTime(20));

    const viewport = container.querySelector<HTMLElement>(".tablet-kiosk-viewport")!;
    expect(viewport.style.getPropertyValue("--tablet-viewport-width")).toBe("800px");
    expect(viewport.style.getPropertyValue("--tablet-viewport-height")).toBe("1280px");

    const rotateButton = container.querySelector<HTMLButtonElement>('button[aria-label="Switch kiosk to landscape"]')!;
    await act(async () => rotateButton.click());

    const kiosk = container.querySelector(".tablet-kiosk")!;
    expect(viewport.classList.contains("is-css-rotated")).toBe(true);
    expect(kiosk.getAttribute("data-orientation")).toBe("landscape");
    expect(window.localStorage.getItem(TABLET_ORIENTATION_STORAGE_KEY)).toBe("landscape");
    const restoreButton = container.querySelector<HTMLButtonElement>('button[aria-label="Switch kiosk to portrait"]')!;
    await act(async () => restoreButton.click());

    expect(viewport.classList.contains("is-css-rotated")).toBe(false);
    expect(kiosk.getAttribute("data-orientation")).toBe("portrait");
    expect(window.localStorage.getItem(TABLET_ORIENTATION_STORAGE_KEY)).toBe("portrait");
  });

  it("ignores saved kiosk rotation and JavaScript viewport sizing on a phone", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    window.localStorage.setItem(TABLET_ORIENTATION_STORAGE_KEY, "landscape");

    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-10-19T05:48:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
        initialView="jobs"
        pendingRequestCount={0}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        today="2026-10-19"
      />,
    ));
    await act(async () => vi.advanceTimersByTime(20));

    const viewport = container.querySelector<HTMLElement>(".tablet-kiosk-viewport")!;
    const kiosk = container.querySelector<HTMLElement>(".tablet-kiosk")!;
    const header = container.querySelector<HTMLElement>(".tablet-kiosk-header")!;
    const mobileNavigation = container.querySelector<HTMLElement>(".tablet-kiosk-tabs-mobile")!;
    expect(viewport.classList.contains("is-css-rotated")).toBe(false);
    expect(viewport.style.getPropertyValue("--tablet-viewport-width")).toBe("");
    expect(viewport.style.getPropertyValue("--tablet-viewport-height")).toBe("");
    expect(kiosk.getAttribute("data-orientation")).toBe("portrait");
    expect(document.documentElement.classList.contains("tablet-kiosk-active")).toBe(true);
    expect(document.body.classList.contains("tablet-kiosk-active")).toBe(true);
    expect(header.contains(mobileNavigation)).toBe(false);
    expect(mobileNavigation.parentElement).toBe(kiosk);
  });

  it("keeps the dedicated mobile experience in its native portrait shell", async () => {
    window.localStorage.setItem(TABLET_ORIENTATION_STORAGE_KEY, "landscape");
    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        experience="mobile"
        initialNow="2026-10-19T10:15:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
        initialView="jobs"
        pendingRequestCount={0}
        pipelineVersion="empty"
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
        refreshIntervalMinutes={15}
        showTodayView
        today="2026-10-19"
      />,
    ));
    await act(async () => vi.advanceTimersByTime(20));

    const viewport = container.querySelector<HTMLElement>(".tablet-kiosk-viewport")!;
    const kiosk = container.querySelector<HTMLElement>(".tablet-kiosk")!;
    expect(viewport.classList.contains("is-dedicated-mobile")).toBe(true);
    expect(viewport.classList.contains("is-css-rotated")).toBe(false);
    expect(viewport.style.getPropertyValue("--tablet-viewport-width")).toBe("");
    expect(kiosk.classList.contains("is-dedicated-mobile")).toBe(true);
    expect(kiosk.getAttribute("data-experience")).toBe("mobile");
    expect(kiosk.getAttribute("data-orientation")).toBe("portrait");

    await act(async () => vi.advanceTimersByTime(75_000));
    expect(container.querySelector('[data-testid="kiosk-screensaver"]')).toBeNull();
  });
});
