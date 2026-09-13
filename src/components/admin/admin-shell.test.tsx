// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./admin-shell";

vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/admin/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/admin/admin-navigation", () => ({ AdminNavigation: () => <nav>Admin navigation</nav> }));
vi.mock("@/components/admin/notion-auto-sync", () => ({ NotionAutoSync: () => null }));

describe("AdminShell request notification", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderShell(pendingRequestCount: number) {
    await act(async () => root.render(
      <AdminShell
        displayName="John"
        role="owner"
        pendingRequestCount={pendingRequestCount}
        notionSyncEnabled={false}
        notionSyncIntervalMinutes={15}
      >
        <main>Workspace</main>
      </AdminShell>,
    ));
    return container.querySelector<HTMLAnchorElement>('a[href="/admin/requests"]')!;
  }

  it("links to requests and displays the active request tally", async () => {
    const notification = await renderShell(2);

    expect(notification.getAttribute("aria-label")).toBe("2 client requests awaiting review");
    expect(notification.textContent).toContain("2");
  });

  it("does not display a badge when there are no active requests", async () => {
    const notification = await renderShell(0);

    expect(notification.getAttribute("aria-label")).toBe("0 client requests awaiting review");
    expect(notification.querySelector("span")).toBeNull();
  });
});
