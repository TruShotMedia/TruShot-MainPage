// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientEnquiry, EnquiryStatus } from "@/lib/types";
import { ClientRequestManager } from "./client-request-manager";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a>,
}));

vi.mock("@/app/admin/actions", () => ({
  approveEnquiry: vi.fn(),
  archiveRejectedEnquiry: vi.fn(),
  markEnquiryReviewing: vi.fn(),
  rejectEnquiry: vi.fn(),
  reopenEnquiry: vi.fn(),
  restoreArchivedEnquiry: vi.fn(),
  updateEnquiryNotes: vi.fn(),
}));

function enquiry(id: string, status: EnquiryStatus, overrides: Partial<ClientEnquiry> = {}): ClientEnquiry {
  return {
    id,
    package_id: null,
    name: `Contact ${id}`,
    business_name: `Business ${id}`,
    email: `${id}@example.com`,
    phone: null,
    message: `Project brief ${id}`,
    budget_range: null,
    preferred_timeline: null,
    source_path: "/",
    status,
    rejection_reason: null,
    internal_notes: null,
    reviewed_at: null,
    converted_client_id: null,
    archived_at: null,
    created_at: "2026-08-24T23:30:00.000Z",
    package: null,
    converted_client: null,
    ...overrides,
  };
}

describe("ClientRequestManager", () => {
  let container: HTMLDivElement;
  let root: Root;

  const enquiries = [
    enquiry("new", "new", { business_name: "New North" }),
    enquiry("review", "reviewing", { business_name: "Review River", internal_notes: "Called on Monday" }),
    enquiry("approved", "approved", { business_name: "Approved Agency", converted_client: { id: "client-1", name: "Approved Agency" } }),
    enquiry("rejected", "declined", { business_name: "Rejected Retail", rejection_reason: "Timeline is not workable." }),
    enquiry("archived", "archived", { business_name: "Archived Arts", rejection_reason: "Outside the current service area.", archived_at: "2026-08-25T01:00:00.000Z" }),
  ];

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<ClientRequestManager enquiries={enquiries} today="2026-08-25" />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function clickTab(name: string) {
    const button = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((item) => item.textContent?.startsWith(name));
    if (!button) throw new Error(`Missing ${name} tab`);
    return act(async () => button.click());
  }

  it("opens on an inbox containing only active requests", () => {
    expect(container.textContent).toContain("New North");
    expect(container.textContent).toContain("Review River");
    expect(container.textContent).not.toContain("Approved Agency");
    expect(container.textContent).not.toContain("Rejected Retail");
    expect(container.textContent).toContain("Today");
  });

  it("keeps rejected requests reviewable before they are archived", async () => {
    await clickTab("Rejected");

    expect(container.textContent).toContain("Rejected Retail");
    expect(container.textContent).toContain("Timeline is not workable.");
    expect(container.textContent).toContain("Reconsider");
    expect(container.textContent).toContain("Archive");
    expect(container.textContent).not.toContain("Archived Arts");
  });

  it("separates archived rejections and offers restoration", async () => {
    await clickTab("Archive");

    expect(container.textContent).toContain("Archived Arts");
    expect(container.textContent).toContain("Outside the current service area.");
    expect(container.textContent).toContain("Restore rejection");
    expect(container.textContent).not.toContain("Rejected Retail");
  });

  it("searches the current request view", async () => {
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Search requests"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "river");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("Review River");
    expect(container.textContent).not.toContain("New North");
  });

  it("requires a private reason when rejecting a request", () => {
    const rejectSummary = [...container.querySelectorAll("summary")]
      .find((item) => item.textContent?.includes("Reject"));
    const form = rejectSummary?.parentElement?.querySelector("form");
    const reason = form?.querySelector<HTMLTextAreaElement>('textarea[name="rejection_reason"]');

    expect(reason?.required).toBe(true);
    expect(reason?.minLength).toBe(3);
    expect(form?.textContent).toContain("move to Rejected");
  });
});
