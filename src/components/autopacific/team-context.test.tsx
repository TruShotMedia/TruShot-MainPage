// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProductionTeamProvider, TeamAvatar, TeamAvatars, useProductionTeam } from "./team-context";
import type { TeamContextData } from "@/lib/production-team";

const team: TeamContextData = { userId: "john", role: "manager", canManage: true, videographerId: "john", selfAvatarUrl: null,
  members: [{ user_id: "john", display_name: "John Herholdt", username: "john", is_active: true, role: "manager", avatar_color: "#579", avatar_url: null }] };
function ProfileUpdate() { const context = useProductionTeam(); return <button onClick={() => context?.updateOwnAvatar("/private-photo?v=2")}>Update photo</button>; }
describe("assignment photos", () => {
  let container: HTMLDivElement, root: Root;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it("falls back to initials if an image fails, and retries a changed photo URL", async () => {
    await act(async () => root.render(<TeamAvatar name="John Herholdt" url="/private-photo?v=1" />));
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/private-photo?v=1");
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.textContent).toBe("JH");
    await act(async () => root.render(<TeamAvatar name="John Herholdt" url="/private-photo?v=2" />));
    expect(container.querySelector("img")).not.toBeNull();
  });
  it("updates existing assignment circles immediately and follows fresh server data", async () => {
    const content = (value: TeamContextData) => <ProductionTeamProvider value={value}><TeamAvatars ids={["john"]} /><ProfileUpdate /></ProductionTeamProvider>;
    await act(async () => root.render(content(team)));
    expect(container.querySelector(".team-avatar")?.textContent).toBe("JH");
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/private-photo?v=2");
    await act(async () => root.render(content({ ...team, selfAvatarUrl: "/private-photo?v=3" })));
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/private-photo?v=3");
  });
});
