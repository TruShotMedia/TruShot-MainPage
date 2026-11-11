// @vitest-environment jsdom
import {act,type ReactNode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({load:vi.fn(),mark:vi.fn()}));
vi.mock("@/app/autopacific/team-actions",()=>({loadTeamComments:mocks.load,markTeamCommentsRead:mocks.mark,loadTeamDirectory:vi.fn(),saveTeamMember:vi.fn()}));
vi.mock("./team-context",()=>({useProductionTeam:()=>({userId:"me",members:[]}),TeamAvatar:()=>null}));
vi.mock("./comment-mentions",async()=>({MentionText:(await import("@/components/shared/linked-text")).LinkedText}));
vi.mock("@/components/shared/workspace-dialog",()=>({WorkspaceDialog:({children,header,footer}:{children:ReactNode;header:ReactNode;footer:ReactNode})=><section role="dialog">{header}{children}{footer}</section>}));
vi.mock("@/components/tablet/tablet-notification-control",()=>({TabletNotificationControl:()=>null}));
import {TeamNotifications} from "./team-workspace";
let host:HTMLDivElement,root:Root;
const note={id:"note",body:"Please check the brief",created_by:"other",created_at:"2026-11-11T00:00:00Z",updated_at:"2026-11-11T00:00:00Z",mention_user_ids:["me"],record_kind:"job",job_id:"job",task_id:null,record_title:"Followed brief",unread:true};
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");mocks.load.mockResolvedValue([note]);mocks.mark.mockResolvedValue(undefined);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function open(onOpenRecord:()=>Promise<void>){await act(async()=>root.render(<TeamNotifications onOpenRecord={onOpenRecord}/>));await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label^="Team updates"]')!.click());}
it("opens the associated record before acknowledging the displayed comment",async()=>{
  const opened=vi.fn(async()=>{});await open(opened);
  await act(async()=>host.querySelector<HTMLButtonElement>(".team-comment-feed button")!.click());
  expect(opened).toHaveBeenCalledWith("job","job");expect(mocks.mark).toHaveBeenCalledWith([{id:"note",updated_at:note.updated_at}]);
  expect(opened.mock.invocationCallOrder[0]).toBeLessThan(mocks.mark.mock.invocationCallOrder[0]);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});
it("keeps unavailable updates unread and displays a retryable error",async()=>{
  await open(async()=>{throw new Error("This job is no longer available.");});
  await act(async()=>host.querySelector<HTMLButtonElement>(".team-comment-feed button")!.click());
  expect(mocks.mark).not.toHaveBeenCalled();expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("no longer available");
  expect(host.querySelector('[aria-label="Unread"]')).not.toBeNull();
});
it("opens a comment URL independently without acknowledging or opening its job",async()=>{
  mocks.load.mockResolvedValue([{...note,body:"Reference https://example.com/brief"}]);
  const opened=vi.fn(async()=>{});await open(opened);
  const link=host.querySelector<HTMLAnchorElement>(".team-comment-preview a")!;
  expect(link.target).toBe("_blank");expect(link.closest("button")).toBeNull();
  link.addEventListener("click",event=>event.preventDefault());
  await act(async()=>link.click());
  expect(opened).not.toHaveBeenCalled();expect(mocks.mark).not.toHaveBeenCalled();
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
});
