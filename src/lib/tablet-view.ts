export const TABLET_VIEW_COOKIE_NAME = "trushot-tablet-view";
export const TABLET_ORIENTATION_STORAGE_KEY = "trushot-tablet-orientation";

export type TabletView = "pipeline" | "calendar";
export type TabletOrientation = "landscape" | "portrait";

export function parseTabletView(value: string | undefined): TabletView {
  return value === "calendar" ? "calendar" : "pipeline";
}

export function parseTabletOrientation(value: string | null): TabletOrientation | null {
  return value === "landscape" || value === "portrait" ? value : null;
}
