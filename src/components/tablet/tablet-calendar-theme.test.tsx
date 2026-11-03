// @vitest-environment jsdom
import { readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CalendarCampaignAsset, CalendarTask } from "@/lib/types";
import { TabletCalendar } from "./tablet-calendar";

vi.mock("@/components/shared/calendar-weather", () => ({
  useCalendarWeather: () => ({ days: [], unavailable: false }),
  CalendarWeatherBadge: () => null, CalendarWeatherCredit: () => null,
  CalendarWeatherDetails: () => null, WeatherIcon: () => null,
}));

const task: CalendarTask = {
  id: "completed-task", entity_type: "task", title: "Completed product reel",
  job_title: "Product launch", client_name: "Autopacific Group",
  due_date: "2026-11-04", due_time: "14:00", priority: "normal",
  status_label: "Posted / Done", status_color: "#3f9b68", is_complete: true,
};
const asset: CalendarCampaignAsset = {
  id: "completed-campaign-asset", entity_type: "campaign-asset", title: "Completed campaign photos",
  campaign_title: "Product launch", client_name: "Autopacific Group",
  start_date: null, start_time: null, due_date: "2026-11-04", due_time: "15:00",
  priority: "normal", status_label: "Posted / Done", status_color: "#3f9b68", is_complete: true,
};
function calendar() {
  return <TabletCalendar density="capacity" accentClientName="Autopacific Group" accentColor="#5d91b0"
    completedColor="#3f9b68" overdueColor="#c5524a" mutedColor="#687177" jobs={[]}
    tasks={[task, { ...task, id: "active", title: "Active product reel", is_complete: false },
      { ...task, id: "overdue", title: "Overdue product reel", due_date: "2026-11-03", is_complete: false }]}
    campaignAssets={[asset]} today="2026-11-04" />;
}

describe("calendar deadline card themes", () => {
  it("mixes completed deadline colours with the active theme rather than a fixed dark background", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = css.match(/\.tablet-calendar\.has-completed-color \.tablet-calendar-event\.is-complete:not\(\.is-delayed-source\):not\(\.is-rescheduled\)\s*\{([^}]+)\}/)?.[1];
    expect(rule).toContain("var(--workspace-surface,#151d18)");
    expect(rule).toContain("var(--workspace-line,rgba(255,255,255,.09))");
    expect(rule).not.toContain("25%,#151d18");
    const foreground = css.match(/\.tablet-calendar\.has-completed-color \.tablet-calendar-event\.is-complete:not\(\.is-delayed-source\):not\(\.is-rescheduled\) :is\(strong, span\)\s*\{([^}]+)\}/)?.[1];
    expect(foreground).toContain("var(--workspace-text,#eef2ef)");
  });

  it.each(["is-light", "is-dark"])("keeps task and campaign asset due cards completed in %s", theme => {
    const html = renderToStaticMarkup(<main className={`apg-desktop ${theme}`}>{calendar()}</main>);
    const container = document.createElement("div"); container.innerHTML = html;
    const complete = [...container.querySelectorAll(".tablet-calendar-event.is-complete")];
    expect(complete).toHaveLength(2);
    expect(complete.map(card => card.querySelector("strong")?.textContent)).toEqual([task.title, asset.title]);
    expect(container.querySelector(".tablet-calendar.has-completed-color")).not.toBeNull();
  });

  it("can render local browser fixtures without adding an authenticated production test route", () => {
    if (!process.env.APG_CALENDAR_PREVIEW_DIR) return;
    const css = ["src/app/globals.css", "src/app/workspace.css", "src/components/autopacific/production-desktop.css"]
      .map(path => readFileSync(path, "utf8")).join("\n");
    for (const surface of ["desktop", "kiosk"]) for (const theme of ["light", "dark"]) {
      const classes = `${surface === "desktop" ? "apg-desktop" : "tablet-kiosk"} theme-autopacific is-${theme}`;
      const content = renderToStaticMarkup(<main className={classes} style={{ display: "block", height: "auto", minHeight: "100vh", padding: 24 }}>
        <h1 style={{ margin: "0 0 16px", fontSize: 20 }}>Asset deadlines · {surface} · {theme} theme</h1>{calendar()}</main>);
      writeFileSync(`${process.env.APG_CALENDAR_PREVIEW_DIR}/asset-calendar-${surface}-${theme}.html`,
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calendar theme verification</title><style>${css}</style></head><body style="margin:0">${content}</body></html>`);
    }
  });
});
