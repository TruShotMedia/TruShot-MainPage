// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TABLET_AUTO_ROTATION_PAUSED_STORAGE_KEY, TABLET_ORIENTATION_STORAGE_KEY, TABLET_VIEW_COOKIE_NAME } from "@/lib/tablet-view";
import { TabletPipelineKiosk } from "./tablet-pipeline-kiosk";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/admin/pipeline-board", () => ({ PipelineBoard: () => <div data-testid="pipeline-view">Pipeline board</div> }));
vi.mock("@/components/admin/notion-auto-sync", () => ({ NotionAutoSync: () => null }));
vi.mock("@/components/tablet/tablet-calendar", () => ({ TabletCalendar: () => <div data-testid="calendar-view">Calendar board</div> }));

describe("TabletPipelineKiosk", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    routerMocks.refresh.mockClear();
    window.localStorage.clear();
    document.cookie = `${TABLET_VIEW_COOKIE_NAME}=; Path=/; Max-Age=0`;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
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
          { id: "task-1", title: "First asset", job_id: "job-1", status_id: "open", asset_type: "Asset", hours: 1, due_date: null, due_time: null, priority: "normal", description: null, position: 1, updated_at: "2026-08-25T00:00:00.000Z" },
          { id: "task-2", title: "Second asset", job_id: "job-1", status_id: "open", asset_type: "Asset", hours: 1, due_date: null, due_time: null, priority: "normal", description: null, position: 2, updated_at: "2026-08-25T00:00:00.000Z" },
          { id: "task-3", title: "Complete asset", job_id: "job-2", status_id: "done", asset_type: "Asset", hours: 1, due_date: null, due_time: null, priority: "normal", description: null, position: 3, updated_at: "2026-08-25T00:00:00.000Z" },
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

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("switches between kiosk views and links the request notification", async () => {
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
    expect(container.querySelector('a[href="/admin/requests"]')?.textContent).toContain("3");
    expect(container.textContent).not.toContain("Full screen");
    expect(container.textContent).not.toContain("due soon");

    const calendarTab = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Calendar"))!;
    await act(async () => calendarTab.click());
    expect(container.querySelector('[data-testid="calendar-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pipeline-view"]')).toBeNull();
    expect(document.cookie).toContain(`${TABLET_VIEW_COOKIE_NAME}=calendar`);
  });

  it("refreshes conservatively only while the kiosk is visible and online", async () => {
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
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="pipeline-view"], [data-testid="calendar-view"]')).not.toBeNull();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => vi.advanceTimersByTime(15 * 60_000));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("rotates immediately with measured dimensions when an old kiosk browser cannot lock orientation", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1024 });
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
    expect(viewport.style.getPropertyValue("--tablet-viewport-width")).toBe("600px");
    expect(viewport.style.getPropertyValue("--tablet-viewport-height")).toBe("1024px");

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
});
