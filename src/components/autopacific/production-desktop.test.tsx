// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import { describe,expect,it,vi } from "vitest";
import { ProductionDesktop } from "./production-desktop";
import { TabletRecordEditEditor } from "@/components/tablet/tablet-workspace-editors";
import type { TabletKioskData,TabletJobRecord } from "@/lib/types";
import { PRODUCTION_WORDMARK } from "@/lib/production-branding";
const weatherMock = vi.hoisted(() => vi.fn(() => ({ days: [], unavailable: false })));
const taskMoveMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
// eslint-disable-next-line @next/next/no-img-element -- Native image stub for component/layout tests only.
vi.mock("next/image",()=>({default:({alt,src,preload,...props}:{alt:string;src:string;preload?:boolean})=><img alt={alt} src={src} data-preload={String(preload)} {...props}/> }));
vi.mock("next/link",()=>({default:({href,children}:{href:string;children:ReactNode})=><a href={href}>{children}</a>}));
vi.mock("next/dynamic",()=>({default:()=>()=>null}));
vi.mock("@/components/admin/notion-auto-sync",()=>({NotionAutoSync:()=>null}));
vi.mock("@/components/shared/calendar-weather",()=>({useCalendarWeather:weatherMock,CalendarWeatherBadge:()=>null,CalendarWeatherCredit:()=>null,CalendarWeatherDetails:()=>null,WeatherIcon:()=>null}));
vi.mock("@/app/admin/actions",()=>({movePipelineTask:taskMoveMock,bulkUpdateJobStatus:vi.fn(),createDeliverableTasks:vi.fn(),updateTabletJob:vi.fn(),saveWorkRecordNote:vi.fn()}));
vi.mock("@/app/autopacific/brief-actions",()=>({loadJobSupportingData:vi.fn(async()=>({attachments:[],linkedTasks:[]})),loadJobBriefHistory:vi.fn(async()=>[]),approveProductionTask:vi.fn()}));
const statuses=[{id:"plan",key:"planning",label:"Planning",color:"#7c8790",position:1,is_closed:false},{id:"scheduled",key:"scheduled",label:"Scheduled",color:"#5d91b0",position:2,is_closed:false},{id:"production",key:"production",label:"Production",color:"#5d91b0",position:3,is_closed:false},{id:"review",key:"review",label:"Review",color:"#795e93",position:4,is_closed:false},{id:"done",key:"delivered",label:"Delivered",color:"#397253",position:5,is_closed:true}];
const job:TabletJobRecord={id:"11111111-2222-4333-8444-555555555555",title:"Rola launch content",job_number:null,client_id:"apg",status_id:"scheduled",shoot_date:"2026-11-10",shoot_time:"09:00",shoot_end_time:"11:00",due_date:"2026-11-13",due_time:"17:00",photos_delivered:0,description:"Capture the product range in a real workshop.",notes:null,location:"Geebung workshop",delivery_url:null,delivered_at:null,updated_at:"2026-10-27T00:00:00.000Z",open_tasks:1,total_tasks:2,status:statuses[1],client:{id:"apg",name:"Autopacific Group"},brief_details:{objective:"Show practical use of the new range",audience:"Trade customers",sections:[{key:"output_specs",body:"9:16 social reel, 30 seconds · MP4"}]},deliverables:[{id:"22222222-3333-4444-8555-666666666666",name:"Product launch reel",date:"2026-11-13"},{id:"33333333-4444-4555-8666-777777777777",name:"Workshop photographs",date:null}]};
const data:TabletKioskData={statuses:[{id:"todo",key:"not_started",label:"Not started",color:"#777",position:1,is_open:true},{id:"progress",key:"in_progress",label:"In progress",color:"#579",position:2,is_open:true},{id:"review",key:"final_draft_notes",label:"Final Draft/Notes",color:"#795",position:3,is_open:true},{id:"posted",key:"posted_done",label:"Posted / Done",color:"#375",position:4,is_open:false}],jobStatuses:statuses,clientOptions:[{id:"apg",name:"Autopacific Group"}],jobOptions:[],pipelineJobs:[job,{...job,id:"draft",title:"Undated planning brief",status_id:"plan",status:statuses[0],shoot_date:null,due_date:null}],pipelineTasks:[{id:"task",job_id:job.id,title:"Launch reel",status_id:"review",asset_type:"Asset",hours:2,due_date:"2026-11-13",due_time:null,priority:"normal",description:null,position:10,completed_at:null,updated_at:job.updated_at,job:{title:job.title,client:{name:"Autopacific Group"}}}],calendarJobs:[{...job,entity_type:"job",client_name:"Autopacific Group",status_label:"Scheduled",status_color:"#579",is_complete:false}],calendarTasks:[],calendarCampaignAssets:[],calendarEvents:[],flightEvents:[],pendingRequestCount:0};
describe("shared desktop workspace",()=>{
 it.each(["production","marketing"] as const)("has three task views and keeps %s permissions intact", async mode => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  taskMoveMock.mockClear();
  const planning={...data.pipelineTasks[0],id:"planned-task",title:"Planned clip",status_id:"todo"};
  const done={...data.pipelineTasks[0],id:"done-task",title:"Delivered clip",status_id:"posted",completed_at:"2026-11-10T10:00:00Z"};
  const fixture={...data,pipelineTasks:[...data.pipelineTasks,planning,done]};
  vi.stubGlobal("fetch",vi.fn(async()=>({status:304})));
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  try {
   await act(async()=>root.render(<ProductionDesktop experience="mobile" data={fixture} mode={mode} initialView="pipeline" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>));
   expect(container.querySelector('[aria-label="Task views"]')?.textContent).toBe("Active jobsPlanningCompleted");
   expect(container.textContent).toContain("Launch reel"); expect(container.textContent).not.toContain("Planned clip"); expect(container.textContent).not.toContain("Delivered clip");
   const planningButton=[...container.querySelectorAll<HTMLButtonElement>('[aria-label="Task views"] button')].find(button=>button.textContent==="Planning")!;
   await act(async()=>planningButton.click());
   expect(container.textContent).toContain("Planned clip"); expect(container.textContent).not.toContain("Launch reel");
   expect(container.querySelector('[aria-label="Move Planned clip to In Progress"]')!==null).toBe(mode==="production");
   if(mode==="production") {
    vi.stubGlobal("fetch",vi.fn(async()=>({status:200,ok:true,headers:new Headers(),json:async()=>({pipelineTasks:[...data.pipelineTasks,{...planning,status_id:"progress"},done]})})));
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Move Planned clip to In Progress"]')!.click());
    expect(taskMoveMock).toHaveBeenCalledWith("planned-task","progress"); expect(container.textContent).not.toContain("Planned clip");
   }
   await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('[aria-label="Task views"] button')].find(button=>button.textContent==="Completed")!.click());
   expect(container.textContent).toContain("Delivered clip"); expect(container.textContent).not.toContain("Launch reel");
   expect(container.querySelector(".drag-handle")).toBeNull();
   if(mode==="marketing")expect(container.querySelector(".apg-task-copy,.apg-task-start")).toBeNull();
  } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
 });
 it("opens and dismisses the mobile settings sheet and preserves all five pages",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(async()=>({status:304})));
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  try {
   await act(async()=>root.render(<ProductionDesktop experience="mobile" data={data} mode="production" initialView="today" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>));
   expect(container.querySelector(".is-mobile-app")).not.toBeNull();
   expect(container.querySelector('[aria-label="Today agenda"]')).not.toBeNull();
   expect(container.querySelectorAll("nav button")).toHaveLength(5);
   await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Open workspace settings"]')!.click());
   expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Account security");
   await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Close workspace settings"]')!.click());
   expect(container.querySelector('[role="dialog"]')).toBeNull();
  } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
 });
 it.each(["production","marketing"] as const)("uses the approved workspace logo on %s",mode=>{
  const html=renderToStaticMarkup(<ProductionDesktop data={data} mode={mode} initialView="jobs" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>);
  expect(html).toContain(PRODUCTION_WORDMARK.src);
  expect(html).toContain(PRODUCTION_WORDMARK.alt);
  expect(html).not.toContain("/brand/autopacific-logo-clean.png");
 });
 it("gives Marketing campaign planning and review-only task actions",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(async()=>({status:304})));const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  try{await act(async()=>root.render(<ProductionDesktop data={data} mode="marketing" initialView="jobs" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>));
    expect([...container.querySelectorAll("nav button")].map(button=>button.textContent)).toEqual(["Jobs","Tasks","Campaigns","Calendar","Today"]);
    expect(document.title).toBe("Jobs | AutoPacific Marketing");
    expect(container.textContent).not.toContain("Undated planning brief");
    await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Planning")!.click());expect(container.textContent).toContain("Undated planning brief");
    expect(document.title).toBe("Planning | AutoPacific Marketing");
    await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("nav button")].find(button=>button.textContent==="Tasks")!.click());
    expect(container.querySelector('.drag-handle,.tablet-card-edit-button,.tablet-card-duplicate-button')).toBeNull();expect(container.querySelector('[aria-label="Approve and complete Launch reel"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Search tasks"]')).not.toBeNull();
    expect(document.title).toBe("Tasks | AutoPacific Marketing");
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
 });
 it("opens a brief from a stable deep link",()=>{const html=renderToStaticMarkup(<ProductionDesktop data={data} mode="production" initialView="jobs" requestedJobId={job.id} today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>);expect(html).toContain("Edit full brief");expect(html).toContain("desktop-brief-panel");});
 it.each(["production","marketing"] as const)("opens the day agenda when switching from Calendar to Today in %s",async(mode)=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(async()=>({status:304})));const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  try{
   await act(async()=>root.render(<ProductionDesktop data={data} mode={mode} initialView="calendar" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>));
   expect(container.querySelector('[aria-label="Production calendar"]')).not.toBeNull();
   expect(weatherMock).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), mode === "marketing" ? "melbourne-city" : "brisbane-city");
   await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("nav button")].find(button=>button.textContent==="Today")!.click());
   expect(container.querySelector('[aria-label="Day schedule"]')).not.toBeNull();
   expect(container.querySelector('[aria-label="Production calendar"]')).toBeNull();
   expect(document.title).toBe(`Today | AutoPacific ${mode === "marketing" ? "Marketing" : "Production"}`);
   expect(document.cookie).toContain(`${mode === "marketing" ? "autopacific-marketing-view" : "trushot-tablet-view"}=today`);
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
 });
 it("merges overlapping tab refreshes without discarding either response",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  type TabResponse={status:number;ok:boolean;json:()=>Promise<unknown>;headers:Headers};
  const pending:Array<(response:TabResponse)=>void>=[];
  vi.stubGlobal("fetch",vi.fn().mockImplementationOnce(()=>new Promise<TabResponse>(resolve=>pending.push(resolve))).mockImplementationOnce(()=>new Promise<TabResponse>(resolve=>pending.push(resolve))).mockResolvedValue({status:304}));
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  try{
   await act(async()=>root.render(<ProductionDesktop data={data} mode="marketing" initialView="jobs" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>));
   await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Refresh current page"]')!.click());
   await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("nav button")].find(button=>button.textContent==="Tasks")!.click());
   const response=(payload:unknown):TabResponse=>({status:200,ok:true,json:async()=>payload,headers:new Headers()});
   await act(async()=>{
    pending[0](response({pipelineJobs:[{...job,title:"Refreshed brief",updated_at:"2026-10-27T01:00:00.000Z"}]}));
    pending[1](response({pipelineTasks:[{...data.pipelineTasks[0],title:"Refreshed asset",updated_at:"2026-10-27T01:00:00.000Z"}]}));
   });
   expect(container.textContent).toContain("Refreshed asset");
   await act(async()=>[...container.querySelectorAll<HTMLButtonElement>("nav button")].find(button=>button.textContent==="Jobs")!.click());
   expect(container.textContent).toContain("Refreshed brief");
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
 });
 it("renders reviewable browser fixtures without exposing an authenticated test route",()=>{
  if(process.env.APG_RENDER_PREVIEWS!=="1")return;
  const css=["src/app/globals.css","src/app/workspace.css","src/components/autopacific/production-wordmark.css","src/components/autopacific/production-desktop.css","src/components/autopacific/production-mobile.css"].map(path=>readFileSync(path,"utf8")).join("\n");
  const views={jobs:<ProductionDesktop data={data} mode="production" initialView="jobs" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,brief:<ProductionDesktop data={data} mode="production" initialView="jobs" requestedJobId={job.id} today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,editor:<main className="apg-desktop is-light theme-autopacific"><TabletRecordEditEditor record={job} type="job" fixedClientId="apg" clientOptions={data.clientOptions} jobOptions={[]} jobStatuses={statuses} taskStatuses={data.statuses} onClose={()=>{}} onSaved={()=>{}} /></main>,calendar:<ProductionDesktop data={data} mode="production" initialView="calendar" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,today:<ProductionDesktop data={data} mode="production" initialView="today" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>};
  const mobileViews={jobs:<ProductionDesktop experience="mobile" data={data} mode="production" initialView="jobs" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,brief:<ProductionDesktop experience="mobile" data={data} mode="production" initialView="jobs" requestedJobId={job.id} today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,editor:views.editor,calendar:<ProductionDesktop experience="mobile" data={data} mode="production" initialView="calendar" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>,today:<ProductionDesktop experience="mobile" data={data} mode="production" initialView="today" today="2026-11-10" refreshIntervalMinutes={15} notificationPublicKey=""/>};
  for(const [key,view] of Object.entries({...views,...Object.fromEntries(Object.entries(mobileViews).map(([key,view])=>[`mobile-${key}`,view]))}))writeFileSync(`${process.env.APG_PREVIEW_DIR??"/private/tmp"}/apg-desktop-${key}.html`,`<!doctype html><html class="apg-desktop-active"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${renderToStaticMarkup(view).replaceAll('src="/brand/','src="https://www.trushotmedia.com/brand/')}</body></html>`);
 });
});
