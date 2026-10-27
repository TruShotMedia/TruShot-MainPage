"use client";

import { useEffect } from "react";
import { autopacificTabTitle } from "@/lib/autopacific-browser-branding";
import type { TabletView } from "@/lib/tablet-view";
import type { WorkspaceMode } from "@/lib/workspace-mode";

export function useWorkspaceTabTitle(mode: WorkspaceMode, view: TabletView, jobView?: "active" | "planning" | "completed", enabled = true) {
  useEffect(() => {
    if (enabled) document.title = autopacificTabTitle(mode, view, jobView);
  }, [enabled, jobView, mode, view]);
}
