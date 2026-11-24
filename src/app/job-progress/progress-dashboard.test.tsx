// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildSharedJobProgress } from "@/lib/job-progress-share";
import { JobProgressDashboard } from "./progress-dashboard";

const token = "11111111-0000-4000-8000-000000000001";
const file = "22222222-0000-4000-8000-000000000001";
const signedUrl = "https://storage.example/signed";
const base = buildSharedJobProgress({ title: "Sample job", status: null }, []);
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", `/job-progress#${token}`);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function unlock() {
  const input = container.querySelector<HTMLInputElement>("#jp-pin")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "036001");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

it("reveals the saved delivery link and shared files only after PIN entry", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ snapshot: {
      ...base, deliveryUrl: "https://example.com/delivery",
      attachments: [{ id: file, name: "Final brief.pdf", size: 8000, viewable: true }],
    } }))
    .mockResolvedValueOnce(Response.json({ url: signedUrl }))
    .mockResolvedValueOnce(Response.json({ url: signedUrl }));
  vi.stubGlobal("fetch", fetcher);
  const replace = vi.fn(), close = vi.fn();
  vi.spyOn(window, "open").mockReturnValue({ location: { replace }, close } as unknown as Window);
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await act(async () => root.render(<JobProgressDashboard />));
  expect(container.textContent).not.toMatch(/View delivery|Final brief/);
  await unlock();
  const delivery = container.querySelector<HTMLAnchorElement>(".jp-delivery");
  expect(delivery?.href).toBe("https://example.com/delivery");
  expect(delivery?.rel).toContain("noreferrer");
  expect(container.textContent).not.toContain("036001");
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="View Final brief.pdf"]')!.click());
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ token, pin: "036001", file, action: "view" });
  expect(replace).toHaveBeenCalledWith(signedUrl);
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Download Final brief.pdf"]')!.click());
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ token, pin: "036001", file, action: "download" });
  expect(clicked).toHaveBeenCalledOnce();
  await act(async () => container.querySelector<HTMLButtonElement>(".jp-footer button")!.click());
  expect(container.textContent).not.toMatch(/View delivery|Final brief/);
});

it("omits the delivery and files section if there is nothing to share", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ snapshot: { ...base, deliveryUrl: null, attachments: [] } })));
  await act(async () => root.render(<JobProgressDashboard />));
  await unlock();
  expect(container.textContent).toContain("Sample job");
  expect(container.querySelector("#jp-resources")).toBeNull();
});
