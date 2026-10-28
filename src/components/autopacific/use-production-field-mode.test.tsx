// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProductionFieldMode } from "./use-production-field-mode";
import { queueAutopacificOfflineMutation, readAutopacificOfflineQueue } from "@/lib/autopacific-offline";
let state: ReturnType<typeof useProductionFieldMode>;
function Harness() { const current = useProductionFieldMode(); useEffect(() => { state = current; }, [current]); return <span>{current.message}</span>; }
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const mutation = { entity: "task" as const, recordId: "task", statusId: "progress", title: "Launch clip", expectedUpdatedAt: "2026-10-28T00:00:00Z" };
beforeEach(() => { localStorage.clear(); (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("mobile field sync safety", () => {
  it("keeps queued changes when the request fails", async () => {
    queueAutopacificOfflineMutation(mutation);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No connection"); }));
    await act(async () => root.render(<Harness />));
    await act(async () => { expect(await state.sync()).toBe(false); });
    expect(readAutopacificOfflineQueue()).toHaveLength(1);
  });
  it("keeps newer live revisions on conflict and removes only settled changes", async () => {
    const [queued] = queueAutopacificOfflineMutation(mutation);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ clientMutationId: queued.clientMutationId, status: "conflict" }] }) })));
    await act(async () => root.render(<Harness />));
    await act(async () => { expect(await state.sync()).toBe(true); });
    expect(readAutopacificOfflineQueue()).toEqual([]);
    expect(state.message).toContain("newer live versions");
  });
  it("does not discard rejected updates but still allows a fresh live read", async () => {
    const [queued] = queueAutopacificOfflineMutation(mutation);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ clientMutationId: queued.clientMutationId, status: "rejected" }] }) })));
    await act(async () => root.render(<Harness />));
    await act(async () => { expect(await state.sync()).toBe(true); });
    expect(readAutopacificOfflineQueue()).toHaveLength(1);
  });
  it("does not call the server when no changes are queued", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(<Harness />));
    await act(async () => { expect(await state.sync()).toBe(true); });
    expect(fetch).not.toHaveBeenCalled();
  });
});
