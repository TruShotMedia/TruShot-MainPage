"use client";

import { useEffect } from "react";
import { autopacificTabTitle } from "@/lib/autopacific-browser-branding";
import type { TabletView } from "@/lib/tablet-view";
import type { WorkspaceMode } from "@/lib/workspace-mode";

export function useWorkspaceTabTitle(mode: WorkspaceMode, view: TabletView, jobView?: "active" | "planning" | "completed", enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const title = autopacificTabTitle(mode, view, jobView);
    const keepTitle = () => { if (document.title !== title) document.title = title; };
    keepTitle();
    // Server Action responses can stream the route's default metadata after
    // the tab effect has run. Keep this mounted workspace's title authoritative.
    const observer = new MutationObserver(keepTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [enabled, jobView, mode, view]);
}
