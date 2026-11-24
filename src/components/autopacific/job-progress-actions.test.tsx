// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { JobProgressSharing } from "./job-progress-actions";

it.each([true, false])("copies only the link and preserves the PIN (branded host enabled: %s)", async branded => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const writeText = vi.fn().mockResolvedValue(undefined);
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ pin: "036001", enabled: false }))
    .mockResolvedValueOnce(Response.json({ pin: "036001", enabled: true, token: "share-token" }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("NEXT_PUBLIC_JOB_PROGRESS_VERCEL_LINKS", branded ? "1" : "");
  vi.useFakeTimers();
  try {
    await act(async () => root.render(<JobProgressSharing jobId="job-one" title="Product launch" />));
    expect(container.textContent).toContain("036001");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy progress link for Product launch"]')!.click());
    const outboundOrigin = branded ? "https://autopac-progress.vercel.app" : window.location.origin;
    expect(writeText).toHaveBeenCalledWith(`${outboundOrigin}/job-progress#share-token`);
    expect(document.querySelector(".job-progress-notice")?.textContent).toContain("036001");
    expect(container.textContent).toContain("Link active");
    await act(async () => vi.advanceTimersByTime(6500));
    expect(document.querySelector(".job-progress-notice")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
