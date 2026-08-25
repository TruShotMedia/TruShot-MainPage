// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
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
  });

  it("refreshes conservatively only while the kiosk is visible and online", async () => {
    await act(async () => root.render(
      <TabletPipelineKiosk
        calendarJobs={[]}
        calendarTasks={[]}
        initialNow="2026-08-25T00:00:00.000Z"
        initialStatuses={[]}
        initialTasks={[]}
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

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => vi.advanceTimersByTime(15 * 60_000));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
  });
});
