// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDeleteControl } from "./invoice-delete-control";

const mocks = vi.hoisted(() => ({ deleteInvoice: vi.fn(async (formData: FormData) => {
  void formData;
  return { ok: true };
}) }));

vi.mock("@/app/admin/actions", () => ({ deleteInvoice: mocks.deleteInvoice }));

describe("InvoiceDeleteControl", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.deleteInvoice.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderControl() {
    await act(async () => root.render(<InvoiceDeleteControl invoiceId="11111111-1111-4111-8111-111111111111" invoiceNumber="INV-0012" />));
  }

  it("requires explicit confirmation and can be cancelled", async () => {
    await renderControl();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete INV-0012"]')!.click());
    expect(container.textContent).toContain("Delete INV-0012 permanently?");

    await act(async () => container.querySelector<HTMLButtonElement>(".invoice-delete-actions > button")!.click());
    expect(container.textContent).not.toContain("Delete INV-0012 permanently?");
    expect(mocks.deleteInvoice).not.toHaveBeenCalled();
  });

  it("submits the selected invoice id after confirmation", async () => {
    await renderControl();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete INV-0012"]')!.click());
    const form = container.querySelector<HTMLFormElement>(".invoice-delete-actions form")!;

    await act(async () => form.requestSubmit());

    expect(mocks.deleteInvoice).toHaveBeenCalledOnce();
    expect((mocks.deleteInvoice.mock.calls[0][0] as FormData).get("id")).toBe("11111111-1111-4111-8111-111111111111");
  });
});
