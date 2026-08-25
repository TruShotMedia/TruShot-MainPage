export const TABLET_VIEW_COOKIE_NAME = "trushot-tablet-view";

export type TabletView = "pipeline" | "calendar";

export function parseTabletView(value: string | undefined): TabletView {
  return value === "calendar" ? "calendar" : "pipeline";
}

