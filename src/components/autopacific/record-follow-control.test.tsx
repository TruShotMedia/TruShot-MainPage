// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({load:vi.fn(),save:vi.fn()}));
vi.mock("@/app/autopacific/follow-actions",()=>({loadWorkRecordFollowing:mocks.load,setWorkRecordFollowing:mocks.save}));
import {RecordFollowControl} from "./record-follow-control";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);host=document.createElement("div");document.body.append(host);root=createRoot(host);mocks.load.mockResolvedValue({following:false});mocks.save.mockResolvedValue({following:true});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const render=async()=>{await act(async()=>root.render(<RecordFollowControl recordId="job" recordKind="job"/>));};
it("loads once, shows a clearly labelled control, and has no background polling",async()=>{await render();expect(mocks.load).toHaveBeenCalledOnce();expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Follow this item’s updates");expect(host.textContent).toBe("Follow");});
it("saves following only, shows its new state and refreshes the personal inbox",async()=>{await render();const changed=vi.fn();window.addEventListener("production-comments-changed",changed,{once:true});await act(async()=>host.querySelector("button")!.click());expect(mocks.save).toHaveBeenCalledWith({recordId:"job",recordKind:"job",following:true});expect(host.textContent).toBe("Following");expect(changed).toHaveBeenCalledOnce();});
it("allows an automatically added follower to leave",async()=>{mocks.load.mockResolvedValue({following:true});mocks.save.mockResolvedValue({following:false});await render();await act(async()=>host.querySelector("button")!.click());expect(mocks.save).toHaveBeenCalledWith({recordId:"job",recordKind:"job",following:false});expect(host.textContent).toBe("Follow");});
it("preserves the previous state when saving fails",async()=>{mocks.save.mockRejectedValue(new Error("offline"));await render();await act(async()=>host.querySelector("button")!.click());expect(host.querySelector("button")?.getAttribute("aria-pressed")).toBe("false");expect(host.querySelector('[role="alert"]')?.textContent).toContain("Please try again");});
it("disables actions if the preference cannot be verified",async()=>{mocks.load.mockRejectedValue(new Error("offline"));await render();expect(host.querySelector("button")?.disabled).toBe(true);expect(host.querySelector('[role="alert"]')).not.toBeNull();});
