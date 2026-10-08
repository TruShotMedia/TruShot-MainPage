// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InvoiceOption } from "@/lib/types";
import { JobInvoiceRelationsField } from "./invoice-relation-picker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const invoices: InvoiceOption[] = [{
  id: "44444444-4444-4444-8444-444444444444",
  invoice_number: "INV-204",
  client_id: "55555555-5555-4555-8555-555555555555",
  client_name: "Ravish Media",
  status: "sent",
  total_cents: 120000,
  issue_date: "2026-08-20",
}];

describe("JobInvoiceRelationsField", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("adds a selected invoice to the submitted relation values immediately", async () => {
    await act(async () => root.render(<form><JobInvoiceRelationsField invoices={invoices} relations={[]} /></form>));
    const search = container.querySelector<HTMLInputElement>('[aria-label="Search invoice to relate to this job"]')!;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Ravish");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const result = container.querySelector<HTMLButtonElement>('[role="option"]')!;
    await act(async () => result.click());

    const form = container.querySelector("form")!;
    expect(new FormData(form).getAll("invoice_ids")).toEqual([invoices[0].id]);
    expect(container.textContent).toContain("INV-204");
    expect(container.textContent).not.toContain("Add invoice");
  });
});
