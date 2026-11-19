import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutopacificWorkspace } from "./autopacific-workspace";
import { ProductionDesktop } from "./production-desktop";
import { TabletPipelineKiosk } from "@/components/tablet/tablet-pipeline-kiosk";
import type { TabletKioskData } from "@/lib/types";

const state = vi.hoisted(() => ({ userAgent: "Desktop", savedView: "jobs" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": state.userAgent }),
  cookies: async () => ({ get: () => ({ value: state.savedView }) }),
}));
vi.mock("./production-desktop", () => ({ ProductionDesktop: () => null }));
vi.mock("@/components/tablet/tablet-pipeline-kiosk", () => ({ TabletPipelineKiosk: () => null }));
vi.mock("./team-context", () => ({ ProductionTeamProvider: () => null }));
vi.mock("@/lib/data/admin", () => ({
  getProductionContext: async () => ({ access: "admin", claims: { sub: "john" }, supabase: {} }),
  getTabletKioskData: async () => fixture,
}));
vi.mock("@/lib/data/production-team", () => ({
  getProductionTeam: async () => ({ role: "manager", userId: "john", videographerId: "john", members: [] }),
}));
vi.mock("@/lib/notion/config", () => ({ getNotionConfigurationSummary: () => ({ configured: false, syncIntervalMinutes: 15 }) }));
const fixture: TabletKioskData = {
  statuses: [], jobStatuses: [], clientOptions: [], jobOptions: [], pipelineJobs: [], pipelineTasks: [],
  calendarJobs: [], calendarTasks: [], calendarCampaignAssets: [], calendarEvents: [], flightEvents: [], pendingRequestCount: 0,
};
beforeEach(() => { state.userAgent = "Desktop"; state.savedView = "jobs"; });
describe("workspace landing", () => {
  it.each(["Desktop", "iPhone", "iPad"])("opens Marketing in Team calendar on %s, ignoring a saved Jobs tab", async userAgent => {
    state.userAgent = userAgent;
    const page = await AutopacificWorkspace({ mode: "marketing", experience: userAgent === "iPhone" ? "mobile" : "kiosk" });
    const workspace = page.props.children;
    expect(workspace.type).toBe(ProductionDesktop);
    expect(workspace.props.initialView).toBe("calendar");
    expect(workspace.props.initialSpace).toBe("team");
  });
  it("keeps explicit Marketing tab and job links intact", async () => {
    const page = await AutopacificWorkspace({ mode: "marketing", experience: "kiosk", requestedView: "jobs", requestedJobId: "brief-id" });
    expect(page.props.children.props).toMatchObject({ initialView: "jobs", requestedJobId: "brief-id" });
    expect(page.props.children.props.initialSpace).toBeUndefined();
  });
  it("keeps a direct brief link without a tab parameter", async () => {
    const page = await AutopacificWorkspace({ mode: "marketing", experience: "kiosk", requestedJobId: "brief-id" });
    expect(page.props.children.props.requestedJobId).toBe("brief-id");
    expect(page.props.children.props.initialSpace).toBeUndefined();
  });
  it("leaves AutoPacific's saved tab and kiosk behaviour unchanged", async () => {
    state.savedView = "pipeline";
    const desktop = await AutopacificWorkspace({ mode: "production", experience: "kiosk" });
    expect(desktop.props.children.props.initialView).toBe("pipeline");
    expect(desktop.props.children.props.initialSpace).toBeUndefined();
    const kiosk = await AutopacificWorkspace({ mode: "production", experience: "kiosk", forceKiosk: true });
    expect(kiosk.type).toBe(TabletPipelineKiosk);
  });
});
